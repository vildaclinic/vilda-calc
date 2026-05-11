/* ==========================================================================
 * vilda_diet_plan_ui.js — diet plan / energy plan renderer
 *
 * Wydzielone z app.js w kroku 8Q-5 bez zmiany wzorów klinicznych,
 * danych referencyjnych, GH/IGF, estimated intake, persistence ani importu/eksportu.
 * ========================================================================== */
(function (window) {
  'use strict';

  const VERSION = '1.0.0';
  const STEP = '8Q-5';
  let initialized = false;
  let globalsExposed = false;

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

  /* ------------------ 1. Dane wejściowe ------------------ */
  // Wiek w latach z uwzględnieniem miesięcy (używany w dalszych obliczeniach)
  const age      = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const sexEl    = document.getElementById('sex');
  const weightEl = document.getElementById('weight');
  const heightEl = document.getElementById('height');
  const palEl    = document.getElementById('palFactor');
  const planResultsContainer = document.getElementById('planResults');
  const planCardContainer = document.getElementById('planCard');
  // Ten moduł nie występuje na wszystkich podstronach. Brak DOM = bezpieczny no-op.
  if (!sexEl || !weightEl || !heightEl || !palEl || !planResultsContainer || !planCardContainer) return;
  const sex      = sexEl.value || 'M';           // 'M' / 'F'
  const anthroValidation = (typeof vildaGetMainAnthroValidationSnapshot === 'function')
    ? vildaGetMainAnthroValidationSnapshot()
    : null;
  const weightKg = anthroValidation && anthroValidation.weight && anthroValidation.weight.value != null
    ? anthroValidation.weight.value
    : +weightEl.value;
  const heightCm = anthroValidation && anthroValidation.height && anthroValidation.height.value != null
    ? anthroValidation.height.value
    : +heightEl.value;
  const pal      = +palEl.value;
  planResultsContainer.classList.toggle('adult-plan-results', Number(age) >= ENERGY_ADULT_START_AGE);

  if(!(
    anthroValidation
      ? anthroValidation.complete
      : (vildaIsFiniteNonNegative(age) && vildaIsFinitePositive(weightKg) && vildaIsFinitePositive(heightCm))
  )) return;                  // brak danych

  /* ------------------ 2. TEE i dostępne diety ------------- */
  const ageMonthsOpt = (parseFloat(document.getElementById('ageMonths')?.value) || 0);
  const isChildEnergy = age >= CHILD_AGE_MIN && age < ENERGY_ADULT_START_AGE;
  const intakeHistory = window.intakeHistory || null;
  const intakeKcalPerDay = window.intakeEstimatedKcalPerDay || null;
  const planState = energyBuildPlanReductionState({
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
    return;
  }

  let teeForDiets = planState.teeBaselineKcal;
  let diets = Array.isArray(planState.diets) ? planState.diets.slice() : proposeDietsFromTEE(teeForDiets, sex, isChildEnergy);

  // Jeśli nie ma żadnych diet (deficyt zbyt niski dla wszystkich poziomów),
  // ukryj opcję wyboru diety i wyświetl informację w wynikach planu.
  if (!diets || diets.length === 0) {
    const dietSel = document.getElementById('dietLevel');
    if (dietSel) {
      vildaAppClearHtml(dietSel);
    }
    // schowaj opis i kaloryczność
    const descEl = document.getElementById('dietDesc');
    const calEl  = document.getElementById('dietCalorieInfo');
    if (descEl) descEl.style.display = 'none';
    if (calEl)  calEl.style.display  = 'none';
    // ukryj wybór diety
    const wrap = document.getElementById('dietChoiceWrap');
    if (wrap) wrap.style.display = 'none';

    // Pokaż planCard, jeśli jest ukryty (np. w przypadku nadwagi), a w planResults umieść informację
    const planCardEl = document.getElementById('planCard');
    if (planCardEl) planCardEl.style.display = 'block';
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
}

function exposeDietPlanUiGlobals() {
  if (!window) return;
  window.DIET_LEVELS = DIET_LEVELS;
  window.DIET_DESCRIPTIONS = DIET_DESCRIPTIONS;
  window.DIET_BULLETS = DIET_BULLETS;
  window.ENERGY_ADULT_START_AGE = ENERGY_ADULT_START_AGE;
  window.ENERGY_CHILD_GROWTH_MULTIPLIER = ENERGY_CHILD_GROWTH_MULTIPLIER;
  window.ENERGY_REFERENCE_INFANT_TABLE = ENERGY_REFERENCE_INFANT_TABLE;
  window.ENERGY_REFERENCE_CHILD_TABLE = ENERGY_REFERENCE_CHILD_TABLE;
  window.ENERGY_PAL_META = ENERGY_PAL_META;
  window.ENERGY_PAL_LABELS = ENERGY_PAL_LABELS;
  window.ENERGY_PAL_TABLE_LABELS = ENERGY_PAL_TABLE_LABELS;
  window.ENERGY_PAL_TABLE_HINTS = ENERGY_PAL_TABLE_HINTS;
  window.PAL_DESCRIPTIONS = PAL_DESCRIPTIONS;
  window.MIN_INTAKE_ADULT = MIN_INTAKE_ADULT;
  window.MIN_INTAKE_CHILD = MIN_INTAKE_CHILD;
  window.updateDietDescription = updateDietDescription;
  window.updatePalDescription = updatePalDescription;
  window.energyResolveEquationStage = energyResolveEquationStage;
  window.energyNormalizeSex = energyNormalizeSex;
  window.energyGetCompletedYears = energyGetCompletedYears;
  window.energyGetCompletedMonths = energyGetCompletedMonths;
  window.energyGetReferenceAgeBand = energyGetReferenceAgeBand;
  window.energyGetReferenceEntry = energyGetReferenceEntry;
  window.energyReferenceWeightKg = energyReferenceWeightKg;
  window.energyResolveReferenceAnthropometry = energyResolveReferenceAnthropometry;
  window.energyResolveAnthropometry = energyResolveAnthropometry;
  window.energyHenryREEkcal = energyHenryREEkcal;
  window.energyButteTEEkcal = energyButteTEEkcal;
  window.energyStageUsesGrowthMultiplier = energyStageUsesGrowthMultiplier;
  window.energyResolveBodyModeFromPolicy = energyResolveBodyModeFromPolicy;
  window.energyResolvePalSelection = energyResolvePalSelection;
  window.energyResolveLegacyPreset = energyResolveLegacyPreset;
  window.energyBuildContext = energyBuildContext;
  window.energyConvertLegacyParams = energyConvertLegacyParams;
  window.energyProjectLegacyEstimate = energyProjectLegacyEstimate;
  window.energyEstimate = energyEstimate;
  window.energyIsNumeric = energyIsNumeric;
  window.energyGetPalMeta = energyGetPalMeta;
  window.energyGetPalOptionLabel = energyGetPalOptionLabel;
  window.energyGetPalDescription = energyGetPalDescription;
  window.energyFormatPalCodeLabel = energyFormatPalCodeLabel;
  window.energyFormatPalRangeLabel = energyFormatPalRangeLabel;
  window.energyGetPresetConfig = energyGetPresetConfig;
  window.energyResolvePalBand = energyResolvePalBand;
  window.energyGetAllowedPals = energyGetAllowedPals;
  window.energyNormalizePal = energyNormalizePal;
  window.BMR = BMR;
  window.proposeDietsFromTEE = proposeDietsFromTEE;
  window.proposeDiets = proposeDiets;
  window.energyMaybeApplyRiskAdjustment = energyMaybeApplyRiskAdjustment;
  window.energyGetContextModeBadge = energyGetContextModeBadge;
  window.energyRenderModeBadgeHtml = energyRenderModeBadgeHtml;
  window.energyBuildIntakeObservedState = energyBuildIntakeObservedState;
  window.energyBuildPlanReductionState = energyBuildPlanReductionState;
  window.energyPopulatePalSelect = energyPopulatePalSelect;
  window.energyPopulatePalSelectByPreset = energyPopulatePalSelectByPreset;
  window.energyPopulatePlanPalSelect = energyPopulatePlanPalSelect;
  window.energyPopulateIntakePalSelect = energyPopulateIntakePalSelect;
  window.fillDietSelect = fillDietSelect;
  window.updatePlanFromDiet = updatePlanFromDiet;
  globalsExposed = true;
}

function initDietPlanUI() {
  exposeDietPlanUiGlobals();
  initialized = true;
  return API;
}

function getSnapshot() {
  const hasAlias = function hasAlias(name) {
    return !!(window && typeof window[name] === 'function');
  };
  return Object.freeze({
    version: VERSION,
    step: STEP,
    readOnly: true,
    moduleOnly: true,
    initialized: !!initialized,
    globalsExposed: !!(
      globalsExposed &&
      hasAlias('updatePlanFromDiet') &&
      hasAlias('fillDietSelect') &&
      hasAlias('updateDietDescription') &&
      hasAlias('updatePalDescription') &&
      hasAlias('BMR') &&
      hasAlias('energyBuildContext') &&
      hasAlias('energyBuildPlanReductionState') &&
      hasAlias('energyBuildIntakeObservedState')
    ),
    didRenderDom: false,
    didWriteStorage: false,
    didCallWindowUpdate: false
  });
}

const API = Object.freeze({
  VERSION: VERSION,
  STEP: STEP,
  init: initDietPlanUI,
  initDietPlanUI: initDietPlanUI,
  getSnapshot: getSnapshot,
  updateDietDescription: updateDietDescription,
  updatePalDescription: updatePalDescription,
  energyBuildContext: energyBuildContext,
  energyBuildPlanReductionState: energyBuildPlanReductionState,
  energyBuildIntakeObservedState: energyBuildIntakeObservedState,
  energyEstimate: energyEstimate,
  energyIsNumeric: energyIsNumeric,
  BMR: BMR,
  proposeDietsFromTEE: proposeDietsFromTEE,
  proposeDiets: proposeDiets,
  fillDietSelect: fillDietSelect,
  updatePlanFromDiet: updatePlanFromDiet,
  energyPopulatePalSelect: energyPopulatePalSelect,
  energyPopulatePlanPalSelect: energyPopulatePlanPalSelect,
  energyPopulateIntakePalSelect: energyPopulateIntakePalSelect,
  energyMaybeApplyRiskAdjustment: energyMaybeApplyRiskAdjustment,
  energyGetContextModeBadge: energyGetContextModeBadge,
  energyRenderModeBadgeHtml: energyRenderModeBadgeHtml
});

exposeDietPlanUiGlobals();
if (window) {
  window.VildaDietPlanUI = API;
  window.vildaGetDietPlanUiSnapshot = getSnapshot;
}
}(typeof window !== 'undefined' ? window : ((typeof globalThis !== 'undefined') ? globalThis : null)));
