/* ==========================================================================
 * vilda_patient_report.js — podsumowanie profesjonalne i raport pacjenta
 *
 * Wydzielone z app.js w kroku 8H. Plik zachowuje dotychczasowe globalne
 * funkcje updateProfessionalSummaryCard(), getFormattedProfessionalSummaryLines(),
 * generatePatientReportPdf(), generatePatientCentileChartPdf(),
 * generatePatientAdvancedGrowthPdf(), generatePatientSelectedPdfPackage() oraz
 * patientReportOpenPdfChoiceDialog().
 * ========================================================================== */

// -----------------------------------------------------------------------------
//  Live updating of the "Podsumowanie wyników" card
//
//  Many auxiliary modules (e.g. blood pressure, circumference, advanced growth)
//  set global variables (such as window.percSbp, window.headCircPercentile, or
//  window.advancedGrowthData) that are read by generateMetabolicSummary().
//  However, these updates do not always trigger an input/change event on the
//  primary form, so without additional listeners the professional summary card
//  will not refresh until the user modifies another field.  To address this,
//  we install property setters on relevant global variables.  Whenever one of
//  these variables changes, we call updateProfessionalSummaryCard() to
//  regenerate and re-render the summary in real time.  The property wrappers
//  store the original value in a closure and remain transparent to the rest
//  of the application.  The initialization is deferred until DOMContentLoaded
//  to ensure updateProfessionalSummaryCard() is defined.
(function() {
  function initSummaryLiveUpdates() {
    const props = [
      'percSbp',
      'zSbp',
      'percDbp',
      'zDbp',
      'headCircPercentile',
      'headCircSD',
      'chestCircPercentile',
      'chestCircSD',
      'colePercentValue',
      'advancedGrowthData'
    ];
    props.forEach(function(prop) {
      try {
        let internal = window[prop];
        Object.defineProperty(window, prop, {
          configurable: true,
          enumerable: true,
          get() { return internal; },
          set(v) {
            internal = v;
            // When the value changes, refresh the professional summary card.
            if (typeof updateProfessionalSummaryCard === 'function') {
              try { updateProfessionalSummaryCard(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 12550 });
    }
  }
            }
          }
        });
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 12554 });
    }
  }
    });
  }
  if (typeof window !== 'undefined' && typeof window.vildaAppOnReady === 'function') {
    window.vildaAppOnReady('app:summary-live-updates', initSummaryLiveUpdates);
  }
})();



function getProfessionalSummaryLineTone(line) {
  try {
    if (!line || typeof line !== 'string') return 'normal';
    const lc = line.toLowerCase();
    const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : NaN;
    const isAdultPatient = (typeof patientReportIsAdultAgeForCurrentMode === 'function')
      ? patientReportIsAdultAgeForCurrentMode(ageYears)
      : ((typeof patientReportIsAdultAge === 'function')
        ? patientReportIsAdultAge(ageYears)
        : (isFinite(ageYears) && ageYears >= 18));
    const weightNow = parseFloat(document.getElementById('weight')?.value) || 0;
    const heightNow = parseFloat(document.getElementById('height')?.value) || 0;
    const adultBmiNow = (isAdultPatient && heightNow > 0 && weightNow > 0 && typeof BMI === 'function')
      ? BMI(weightNow, heightNow)
      : null;
    const adultBmiAssessment = isAdultPatient ? patientReportGetAdultBmiAssessment(adultBmiNow) : null;

    const extractPercentile = (str) => {
      const m = str.match(/([<>]?)\s*([\d]+(?:[\.,]\d+)?)[^\d]*centyl/i);
      if (!m) return null;
      let perc = parseFloat(String(m[2]).replace(',', '.'));
      if (m[1] && m[1].includes('<')) perc = 0;
      if (m[1] && m[1].includes('>')) perc = 100;
      return isNaN(perc) ? null : perc;
    };

    if (isAdultPatient) {
      if (lc.startsWith('wskaźnik cole')) return 'normal';
      if (lc.startsWith('wzrost') || lc.startsWith('tempo wzrastania') || lc.startsWith('aktualne tempo') || lc.startsWith('mph') || lc.startsWith('hsds')) {
        return 'normal';
      }
      if (lc.startsWith('ciśnienie')) {
        if (window.adultVitalsApi && typeof window.adultVitalsApi.getState === 'function' && typeof window.adultVitalsApi.classifyBloodPressure === 'function') {
          const state = window.adultVitalsApi.getState();
          const hasInput = (window.adultVitalsApi && typeof window.adultVitalsApi.hasAnyMeasurement === 'function')
            ? window.adultVitalsApi.hasAnyMeasurement(state)
            : false;
          const guidelineKey = hasInput ? state.guidelineKey : 'ESC';
          const info = window.adultVitalsApi.classifyBloodPressure(state.sbp, state.dbp, guidelineKey);
          return info ? (info.tone || 'normal') : 'normal';
        }
        return 'normal';
      }
      if (lc.startsWith('tętno') || lc.startsWith('hr ')) {
        if (window.adultVitalsApi && typeof window.adultVitalsApi.getState === 'function' && typeof window.adultVitalsApi.classifyHeartRate === 'function') {
          const state = window.adultVitalsApi.getState();
          const info = window.adultVitalsApi.classifyHeartRate(state.hr, { athlete: state.athlete, betaBlocker: state.betaBlocker });
          return info ? (info.tone || 'normal') : 'normal';
        }
        return 'normal';
      }
      if (lc.startsWith('waga') || lc.startsWith('bmi')) {
        return adultBmiAssessment ? (adultBmiAssessment.tone || 'normal') : 'normal';
      }
    }

    if (lc.startsWith('bmi:')) {
      const weight = parseFloat(document.getElementById('weight')?.value) || 0;
      const height = parseFloat(document.getElementById('height')?.value) || 0;
      const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
      const sexVal = document.getElementById('sex')?.value || 'M';
      if (height > 0 && weight > 0) {
        let bmiVal = null;
        if (typeof BMI === 'function') bmiVal = BMI(weight, height);
        if (bmiVal && !isNaN(bmiVal)) {
          let category = null;
          const months = Math.round(ageYears * 12);
          if (typeof bmiCategoryChild === 'function' && ageYears >= CHILD_AGE_MIN && ageYears <= CHILD_AGE_MAX) {
            category = bmiCategoryChild(bmiVal, sexVal, months);
          } else if (typeof bmiCategory === 'function') {
            category = bmiCategory(bmiVal);
          }
          const catStr = String(category || '');
          if (catStr.includes('Otyłość')) return 'danger';
          if (catStr === 'Niedowaga' || catStr === 'Nadwaga') return 'warn';
          return 'normal';
        }
      }
      return 'normal';
    }

    if (lc.startsWith('wskaźnik cole')) {
      const mCole = line.match(/([\d]+(?:[\.,]\d+)?)\s*%/);
      if (mCole) {
        const coleVal = parseFloat(String(mCole[1]).replace(',', '.'));
        if (!isNaN(coleVal)) {
          if (coleVal < 90 || coleVal >= 120) return 'danger';
          if (coleVal > 110 && coleVal < 120) return 'warn';
        }
      }
      return 'normal';
    }

    if (lc.startsWith('whr:')) {
      const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
      const sexVal = document.getElementById('sex')?.value || 'M';
      const weight = parseFloat(document.getElementById('weight')?.value) || 0;
      const height = parseFloat(document.getElementById('height')?.value) || 0;
      const waist = parseFloat(document.getElementById('waistCm')?.value) || 0;
      const hip = parseFloat(document.getElementById('hipCm')?.value) || 0;
      let bmiNow = null;
      if (typeof BMI === 'function' && weight > 0 && height > 0) {
        bmiNow = BMI(weight, height);
      }
      const bmiPChild = (typeof window !== 'undefined' && typeof window.bmiPercentileValue === 'number') ? window.bmiPercentileValue : null;
      const coleCatNow = (typeof window !== 'undefined' && typeof window.coleCatValue === 'string') ? window.coleCatValue : null;
      if (typeof interpretWHR === 'function' && ageYears && sexVal && waist > 0 && hip > 0) {
        try {
          const res = interpretWHR(ageYears, sexVal, waist, hip, bmiNow, bmiPChild, coleCatNow);
          if (res && res.state) {
            if (res.state === 'bad') return 'danger';
            if (res.state === 'warn') return 'warn';
            return 'normal';
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 12680 });
    }
  }
      }
      const whrMatch = line.match(/whr:\s*([\d]+(?:[\.,]\d+)?)/i);
      if (whrMatch) {
        const val = parseFloat(String(whrMatch[1]).replace(',', '.'));
        let limit = 0.9;
        try {
          if (typeof ADULT_WHR_LIMIT !== 'undefined' && ADULT_WHR_LIMIT) {
            limit = ADULT_WHR_LIMIT[sexVal] || limit;
          }
        } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 12690 });
    }
  }
        if (val > limit) return 'danger';
      }
      return 'normal';
    }

    if (lc.startsWith('hsds')) {
      try {
        const diffMatch = line.match(/hsds\s*[-‑]\s*mpsds\s*[:=]\s*([-+]?\d+(?:[\.,]\d+)?)/i);
        if (diffMatch) {
          const diffVal = parseFloat(String(diffMatch[1]).replace(',', '.'));
          if (!isNaN(diffVal)) {
            const absDiff = Math.abs(diffVal);
            if (absDiff >= 2) return 'danger';
            if (absDiff >= 1.5) return 'warn';
          }
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 12707 });
    }
  }
      return 'normal';
    }

    if (lc.startsWith('mph')) {
      try {
        const zMatch = line.match(/z[-‑]?score\s*[:=]\s*([-+]?\d+(?:[\.,]\d+)?)/i);
        if (zMatch) {
          const z = parseFloat(String(zMatch[1]).replace(',', '.'));
          if (!isNaN(z)) {
            const absZ = Math.abs(z);
            if (absZ >= 2) return 'danger';
            if (absZ >= 1.5) return 'warn';
          }
        }
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 12722 });
    }
  }
      return 'normal';
    }

    if (lc.includes('centyl')) {
      const perc = extractPercentile(line);
      if (perc !== null) {
        const isWeightLine = lc.startsWith('waga') || lc.startsWith('weight');
        const isHeightLine = lc.startsWith('wzrost') || lc.startsWith('height');
        if (isWeightLine) {
          if (perc <= 3 || perc >= 97) return 'danger';
          if ((perc > 3 && perc < 10) || (perc >= 90 && perc < 97)) return 'warn';
          return 'normal';
        }
        if (isHeightLine) {
          if (perc <= 3) return 'danger';
          if ((perc > 3 && perc < 10) || (perc > 97)) return 'warn';
          return 'normal';
        }
        if (perc <= 3 || perc >= 97) return 'danger';
        if (perc <= 5 || perc >= 95) return 'warn';
      }
    }

    return 'normal';
  } catch (_) {
    return 'normal';
  }
}

function getProfessionalSummaryLineColor(line) {
  const tone = getProfessionalSummaryLineTone(line);
  if (tone === 'danger') return 'var(--danger)';
  if (tone === 'warn') return '#c75d00';
  return 'var(--primary)';
}

function patientReportFormatSummaryLineWithValue(label, valueWithUnit, rest) {
  const normalizedLabel = String(label || '').trim();
  const normalizedValue = String(valueWithUnit || '').trim();
  const normalizedRest = String(rest || '').trim();
  if (normalizedValue && normalizedRest) {
    return `${normalizedLabel}: ${normalizedValue}, ${normalizedRest}`;
  }
  if (normalizedValue) {
    return `${normalizedLabel}: ${normalizedValue}`;
  }
  if (normalizedRest) {
    return `${normalizedLabel}: ${normalizedRest}`;
  }
  return normalizedLabel ? `${normalizedLabel}:` : '';
}


/* === NUTRITION NORMS REPORT BRIDGE START ======================== */
function patientReportFormatNutritionNormsKcal(value) {
  if (typeof value !== 'number' || !isFinite(value)) return '—';
  return `${patientReportFormatNumber(value, 0)} kcal/d`;
}

function patientReportFormatNutritionNormsPercentRange(range) {
  if (!Array.isArray(range) || range.length !== 2) return '—';
  const min = range[0];
  const max = range[1];
  if (!(typeof min === 'number' && isFinite(min) && typeof max === 'number' && isFinite(max))) return '—';
  return `${patientReportFormatNumber(min, 0)}–${patientReportFormatNumber(max, 0)}% energii`;
}

function patientReportFormatNutritionNormsGramRange(range, digits) {
  if (!Array.isArray(range) || range.length !== 2) return '—';
  const min = range[0];
  const max = range[1];
  if (!(typeof min === 'number' && isFinite(min) && typeof max === 'number' && isFinite(max))) return '—';
  const precision = Number.isFinite(digits) ? digits : 0;
  return `${patientReportFormatNumber(min, precision)}–${patientReportFormatNumber(max, precision)} g/d`;
}

function patientReportBuildNutritionNormsModelFromCurrentState(uiOverrides) {
  if (typeof window === 'undefined' || typeof window.nutritionNormsBuildCardModel !== 'function') return null;
  const ageYears = (typeof getAgeDecimal === 'function')
    ? getAgeDecimal()
    : parseFloat(document.getElementById('age')?.value);
  const ageMonthsOpt = parseFloat(document.getElementById('ageMonths')?.value || '0');
  const sex = document.getElementById('sex')?.value || 'M';
  const weightKg = parseFloat(document.getElementById('weight')?.value);
  const heightCm = parseFloat(document.getElementById('height')?.value);
  const mainPal = parseFloat(document.getElementById('palFactor')?.value);
  const baseUiState = (window.nutritionNormsUiState && typeof window.nutritionNormsUiState === 'object')
    ? window.nutritionNormsUiState
    : {};
  const mergedUiState = {
    ...baseUiState,
    ...(uiOverrides || {})
  };
  try {
    return window.nutritionNormsBuildCardModel({
      ageYears,
      ageMonthsOpt,
      sex,
      weightKg,
      heightCm,
      mainPal
    }, mergedUiState);
  } catch (_) {
    return null;
  }
}

function patientReportBuildNutritionNormsPalLabel(model) {
  const energy = model && model.energy;
  if (!energy) return '';
  if (energy.palMode === 'fixed' && typeof energy.usedPal === 'number' && isFinite(energy.usedPal)) {
    return `PAL ${patientReportFormatNumber(energy.usedPal, 1)}`;
  }
  const items = Array.isArray(energy.items)
    ? energy.items.filter((item) => item && typeof item.pal === 'number' && isFinite(item.pal))
    : [];
  if (energy.palMode === 'range' && items.length > 1) {
    return `zakres PAL ${patientReportFormatNumber(items[0].pal, 1)}–${patientReportFormatNumber(items[items.length - 1].pal, 1)}`;
  }
  if (energy.palMode === 'single' && model && model.ageBand && model.ageBand.kind === 'infant_6_11') {
    return 'wg Butte';
  }
  return '';
}


function patientReportBuildNutritionNormsActivityDescription(model) {
  const energy = model && model.energy;
  if (!energy) return '';

  if (model && model.ageBand && model.ageBand.kind === 'infant_6_11') {
    return 'Przedstawiono obliczenia energii według modelu dla niemowląt w drugiej połowie 1. roku życia.';
  }

  if (energy.palMode === 'range' || energy.mode === 'range') {
    return 'Przedstawiono obliczenia dla zakresu poziomów aktywności fizycznej.';
  }

  const usedPal = Number(energy.usedPal);
  if (!isFinite(usedPal)) return '';

  let activityLabel = 'wybranego poziomu aktywności fizycznej';
  if (usedPal <= 1.4) {
    activityLabel = 'małej aktywności fizycznej';
  } else if (usedPal <= 1.6) {
    activityLabel = 'umiarkowanej aktywności fizycznej';
  } else if (usedPal <= 1.8) {
    activityLabel = 'aktywnego trybu życia';
  } else {
    activityLabel = 'bardzo aktywnego trybu życia';
  }

  return `Przedstawiono obliczenia dla ${activityLabel}.`;
}

function patientReportBuildNutritionNormsActivityPhrase(model) {
  const energy = model && model.energy;
  if (!energy) return '';

  if (model && model.ageBand && model.ageBand.kind === 'infant_6_11') {
    return 'według modelu dla niemowląt w drugiej połowie 1. roku życia';
  }

  if (energy.palMode === 'range' || energy.mode === 'range') {
    return 'dla zakresu poziomów aktywności fizycznej';
  }

  const usedPal = Number(energy.usedPal);
  if (!isFinite(usedPal)) return '';

  if (usedPal <= 1.4) {
    return 'przy małej aktywności fizycznej';
  }
  if (usedPal <= 1.6) {
    return 'przy umiarkowanej aktywności fizycznej';
  }
  if (usedPal <= 1.8) {
    return 'przy aktywnym trybie życia';
  }
  return 'przy bardzo aktywnym trybie życia';
}

function patientReportBuildNutritionNormsEnergyText(model) {
  if (!model || !model.energy) return '—';
  const energy = model.energy;
  if (model.ageBand && model.ageBand.kind === 'infant_0_6') {
    return 'brak norm liczbowych';
  }
  if (!energy.available) return '—';
  if ((energy.mode === 'single' || energy.mode === 'fixed') && Array.isArray(energy.items) && energy.items[0]) {
    return patientReportFormatNutritionNormsKcal(energy.items[0].teeKcal);
  }
  if (Array.isArray(energy.range) && energy.range.length === 2) {
    if (energy.range[0] === energy.range[1]) {
      return patientReportFormatNutritionNormsKcal(energy.range[0]);
    }
    return `${patientReportFormatNumber(energy.range[0], 0)}–${patientReportFormatNumber(energy.range[1], 0)} kcal/d`;
  }
  return '—';
}

function patientReportBuildNutritionNormsProteinText(model, options) {
  const opts = options || {};
  const protein = model && model.protein;
  if (!protein || !protein.targets) return '—';
  const targets = protein.targets;
  if (!targets.available) return 'brak norm liczbowych';
  const planningPercentText = patientReportFormatNutritionNormsPercentRange(protein.planningPercentRange);
  const planningGramText = patientReportFormatNutritionNormsGramRange(protein.planningGramRange, 0);
  if (opts.planning) {
    if (planningPercentText !== '—' && planningGramText !== '—') {
      return `${planningPercentText} ➔ ${planningGramText}`;
    }
    if (planningGramText !== '—') return planningGramText;
    if (planningPercentText !== '—') return planningPercentText;
    return '—';
  }
  if (protein.main) {
    if (opts.includeEar && opts.verbose) {
      return `Średnie zapotrzebowanie (EAR): ${patientReportFormatNumber(protein.main.earGDay, 0)} g/d • Zalecane spożycie (RDA): ${patientReportFormatNumber(protein.main.rdaGDay, 0)} g/d`;
    }
    if (opts.includeEar) {
      return `${patientReportFormatNumber(protein.main.earGDay, 0)} / ${patientReportFormatNumber(protein.main.rdaGDay, 0)} g/d`;
    }
    return `${patientReportFormatNumber(protein.main.rdaGDay, 0)} g/d`;
  }
  if (opts.includeEar && opts.verbose) {
    return `Średnie zapotrzebowanie (EAR): ${patientReportFormatNumber(targets.ear_g_per_kg, 2)} g/kg • Zalecane spożycie (RDA): ${patientReportFormatNumber(targets.rda_g_per_kg, 2)} g/kg`;
  }
  if (opts.includeEar) {
    return `${patientReportFormatNumber(targets.ear_g_per_kg, 2)} / ${patientReportFormatNumber(targets.rda_g_per_kg, 2)} g/kg`;
  }
  return `${patientReportFormatNumber(targets.rda_g_per_kg, 2)} g/kg`;
}

function patientReportBuildNutritionNormsMacroShortText(section) {
  if (!section) return '—';
  const gramText = patientReportFormatNutritionNormsGramRange(section.gramRange, 0);
  if (gramText !== '—') return gramText;
  return patientReportFormatNutritionNormsPercentRange(section.percentRange);
}

function patientReportBuildNutritionNormsMacroDetailedText(section) {
  if (!section) return '—';
  const percentText = patientReportFormatNutritionNormsPercentRange(section.percentRange);
  const gramText = patientReportFormatNutritionNormsGramRange(section.gramRange, 0);
  if (percentText !== '—' && gramText !== '—') {
    return `${percentText} ➔ ${gramText}`;
  }
  if (gramText !== '—') return gramText;
  return percentText;
}

function patientReportBuildNutritionNormsContextLabel(model) {
  const parts = [];
  const basisLabel = String(model?.energy?.basisLabel || '').trim();
  const palLabel = patientReportBuildNutritionNormsPalLabel(model);
  if (basisLabel) parts.push(basisLabel);
  if (palLabel) parts.push(palLabel);
  return parts.join('; ');
}

function patientReportShouldIncludeNutritionInSummary(model) {
  if (model && model.ui && model.ui.state && typeof model.ui.state.includeInSummary === 'boolean') {
    return model.ui.state.includeInSummary;
  }
  if (typeof window !== 'undefined' && window.nutritionNormsUiState && typeof window.nutritionNormsUiState.includeInSummary === 'boolean') {
    return window.nutritionNormsUiState.includeInSummary;
  }
  return false;
}

function patientReportBuildNutritionSummaryLinesFromModel(model) {
  if (!model) return [];
  if (!patientReportShouldIncludeNutritionInSummary(model)) return [];
  if (model.ageBand && model.ageBand.kind === 'infant_0_6') {
    return ['Normy żywieniowe: poniżej 6 miesięcy nie prezentujemy liczbowych norm energii i makroskładników.'];
  }

  const energyText = patientReportBuildNutritionNormsEnergyText(model);
  const activityPhrase = patientReportBuildNutritionNormsActivityPhrase(model);
  const line1 = energyText !== '—'
    ? `Szacowane dzienne zapotrzebowanie na energię do planowania diety${activityPhrase ? ` ${activityPhrase}` : ''}: ${energyText}.`
    : 'Szacowane dzienne zapotrzebowanie na energię do planowania diety: brak danych do wyliczeń.';

  const proteinText = patientReportBuildNutritionNormsProteinText(model, { planning: true, includeEar: false });
  const fatText = patientReportBuildNutritionNormsMacroDetailedText(model.fat);
  const carbText = patientReportBuildNutritionNormsMacroDetailedText(model.carbs);
  const line2 = `Makroskładniki do planowania diety: białko ${proteinText}; tłuszcz ${fatText}; węglowodany ${carbText}.`;

  return [line1, line2].filter(Boolean);
}

function patientReportBuildNutritionSummaryLines() {
  const model = patientReportBuildNutritionNormsModelFromCurrentState();
  return patientReportBuildNutritionSummaryLinesFromModel(model);
}

function patientReportBuildNutritionCardFromModel(model) {
  if (!model) {
    return {
      kind: 'nutrition-norms',
      title: 'Normy żywieniowe',
      subtitle: 'Energia i makroskładniki',
      badge: 'Brak danych',
      value: '—',
      note: 'Nie udało się odczytać modelu norm żywieniowych dla bieżących danych.',
      rows: [],
      tableHeaders: ['Składnik', 'Wartość']
    };
  }

  if (model.ageBand && model.ageBand.kind === 'infant_0_6') {
    return {
      kind: 'nutrition-norms',
      title: 'Normy żywieniowe',
      subtitle: 'Energia i makroskładniki',
      badge: 'Informacyjnie',
      value: 'brak norm liczbowych',
      note: 'Dla wieku poniżej 6 miesięcy normy nie podają liczbowej energii i makroskładników; standardem pozostaje mleko kobiece.',
      rows: [],
      tableHeaders: ['Składnik', 'Wartość']
    };
  }

  const rows = [];
  rows.push({
    label: 'Węglowodany',
    valueText: patientReportBuildNutritionNormsMacroDetailedText(model.carbs)
  });
  rows.push({
    label: 'Białko',
    valueText: patientReportBuildNutritionNormsProteinText(model, { planning: true })
  });
  rows.push({
    label: 'Tłuszcze',
    valueText: patientReportBuildNutritionNormsMacroDetailedText(model.fat)
  });

  const noteParts = [];
  if (model.notes && model.notes.averageText) {
    noteParts.push(model.notes.averageText);
  }
  if (model.notes && model.notes.sourceLong) {
    noteParts.push(model.notes.sourceLong);
  }
  const activityDescription = patientReportBuildNutritionNormsActivityDescription(model);
  if (activityDescription) {
    noteParts.push(activityDescription);
  }
  if (model.fat && model.fat.lowActivityNote) {
    noteParts.push(model.fat.lowActivityNote);
  }

  return {
    kind: 'nutrition-norms',
    title: 'Normy żywieniowe',
    subtitle: 'Energia i makroskładniki',
    badge: (model.energy && model.energy.available) ? 'Normy' : 'Informacyjnie',
    value: patientReportBuildNutritionNormsEnergyText(model),
    note: noteParts.join(' '),
    rows,
    tableHeaders: ['Składnik', 'Wartość']
  };
}

function patientReportBuildNutritionCard() {
  return patientReportBuildNutritionCardFromModel(patientReportBuildNutritionNormsModelFromCurrentState());
}

if (typeof window !== 'undefined') {
  window.patientReportBuildNutritionNormsModelFromCurrentState = patientReportBuildNutritionNormsModelFromCurrentState;
  window.patientReportBuildNutritionSummaryLinesFromModel = patientReportBuildNutritionSummaryLinesFromModel;
  window.patientReportBuildNutritionSummaryLines = patientReportBuildNutritionSummaryLines;
  window.patientReportBuildNutritionCardFromModel = patientReportBuildNutritionCardFromModel;
  window.patientReportBuildNutritionCard = patientReportBuildNutritionCard;
}
/* === NUTRITION NORMS REPORT BRIDGE END ========================== */


function getFormattedProfessionalSummaryLines() {
  let linesRaw = '';
  try {
    linesRaw = (typeof generateMetabolicSummary === 'function') ? (generateMetabolicSummary() || '') : '';
  } catch (_) {
    linesRaw = '';
  }
  if (!String(linesRaw || '').trim()) return [];

  let lines = String(linesRaw)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : NaN;
    const isAdultPatient = (typeof patientReportIsAdultAgeForCurrentMode === 'function')
      ? patientReportIsAdultAgeForCurrentMode(ageYears)
      : ((typeof patientReportIsAdultAge === 'function')
        ? patientReportIsAdultAge(ageYears)
        : (isFinite(ageYears) && ageYears >= 18));
    if (isAdultPatient) {
      lines = lines.filter((line) => !/^\s*wskaźnik\s*cole/i.test(String(line || '').replace(/ /g, ' ')));
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13127 });
    }
  }

  try {
    const weightValStr = (document.getElementById('weight')?.value || '').trim();
    const heightValStr = (document.getElementById('height')?.value || '').trim();
    const sbpValStr = (document.getElementById('bpSystolic')?.value || '').trim();
    const dbpValStr = (document.getElementById('bpDiastolic')?.value || '').trim();
    const headCircValStr = (document.getElementById('headCircumference')?.value || '').trim();
    const chestCircValStr = (document.getElementById('chestCircumference')?.value || '').trim();

    lines = lines.map(function(line) {
      if (line.startsWith('Waga:')) {
        const rest = line.slice(line.indexOf(':') + 1).trim();
        const valueLabel = weightValStr ? (weightValStr + ' kg') : '';
        return patientReportFormatSummaryLineWithValue('Waga', valueLabel, rest);
      }
      if (line.startsWith('Wzrost:')) {
        const rest = line.slice(line.indexOf(':') + 1).trim();
        const valueLabel = heightValStr ? (heightValStr + ' cm') : '';
        return patientReportFormatSummaryLineWithValue('Wzrost', valueLabel, rest);
      }
      if (line.startsWith('Ciśnienie skurczowe')) {
        const rest = line.slice(line.indexOf(':') + 1).trim();
        const prefix = sbpValStr ? (sbpValStr + ' mmHg, ') : '';
        return 'RR skurczowe: ' + prefix + rest;
      }
      if (line.startsWith('Ciśnienie rozkurczowe')) {
        const rest = line.slice(line.indexOf(':') + 1).trim();
        const prefix = dbpValStr ? (dbpValStr + ' mmHg, ') : '';
        return 'RR rozkurczowe: ' + prefix + rest;
      }
      if (line.startsWith('Obwód głowy')) {
        const rest = line.slice(line.indexOf(':') + 1).trim();
        const prefix = headCircValStr ? (headCircValStr + ' cm, ') : '';
        return 'Obwód głowy: ' + prefix + rest;
      }
      if (line.startsWith('Obwód klatki piersiowej')) {
        const rest = line.slice(line.indexOf(':') + 1).trim();
        const prefix = chestCircValStr ? (chestCircValStr + ' cm, ') : '';
        return 'Obwód kl. piersiowej: ' + prefix + rest;
      }
      if (/^MPH \(mid[-‑]parental height\):/i.test(line)) {
        let newLine = line.replace(/^MPH \(mid[^)]*\):/i, 'MPH:');
        newLine = newLine.replace(/z-score:/i, 'Z-score:');
        return newLine;
      }
      return line;
    });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13175 });
    }
  }

  return lines;
}

function attachPatientReportActionToSummaryCard(options) {
  try {
    document.querySelectorAll('.current-summary-actions').forEach((node) => {
      try { node.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13183 });
    }
  }
    });

    const opts = options || {};
    if (!opts.shouldShow || !(opts.isDocPro || opts.proMode)) {
      if (typeof window.adjustSummaryCardsHeight === 'function') {
        try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13189 });
    }
  }
      }
      return;
    }

    let targetCard = null;
    if (opts.prevVisible) {
      targetCard =
        document.getElementById('currentSummaryCardRight') ||
        document.querySelector('#currentSummaryFullWrap .current-summary-card:last-child') ||
        document.querySelector('#currentSummaryWrap .current-summary-card:last-child');
    } else {
      targetCard = document.getElementById('currentSummaryCard');
    }

    if (!targetCard) {
      if (typeof window.adjustSummaryCardsHeight === 'function') {
        try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13206 });
    }
  }
      }
      return;
    }

    const actionWrap = document.createElement('div');
    actionWrap.className = 'current-summary-actions';
    vildaAppSetTrustedHtml(actionWrap, `
      <button type="button" class="patient-report-summary-btn" data-patient-report-pdf-btn>
        Raport PDF dla pacjenta
      </button>
      
    `, 'app:actionWrap');
    targetCard.appendChild(actionWrap);

    if (typeof window.adjustSummaryCardsHeight === 'function') {
      try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13222 });
    }
  }
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13224 });
    }
  }
}

// === Karta „Podsumowanie wyników” (tryb profesjonalny) ===
/**
 * Aktualizuje zawartość i pozycję karty „Podsumowanie wyników”.
 * Karta jest widoczna w trybie profesjonalnym na stronie głównej
 * (po włączeniu profesjonalnego trybu) oraz zawsze na stronie DocPro.
 * Jeżeli użytkownik wczytał poprzednie dane (widoczna jest karta
 * „Ostatni pomiar”), karta podsumowania zostanie przeniesiona pod obie
 * kolumny i podzielona na dwie części o równej liczbie wierszy.
 */
// === Karta „Podsumowanie wyników” (tryb profesjonalny) ===
function updateProfessionalSummaryCard(_retry) {
  const card     = document.getElementById('currentSummaryCard');
  const wrap     = document.getElementById('currentSummaryWrap');
  const fullWrap = document.getElementById('currentSummaryFullWrap'); // na DocPro może nie istnieć
  const content  = document.getElementById('currentSummaryContent');
  if (!card || !wrap || !content) return;

  // Pomocnicze: usuwanie poprzednich klonów
  const removeClones = () => {
    document.getElementById('currentSummaryCardLeft')?.remove();
    document.getElementById('currentSummaryCardRight')?.remove();
  };

  // Ustal, czy jesteśmy na DocPro oraz czy tryb profesjonalny jest aktywny
  const isDocPro = typeof window !== 'undefined'
    && window.location && window.location.pathname
    && window.location.pathname.includes('docpro.html');

  let proMode = false;
  if (typeof professionalMode !== 'undefined') proMode = !!professionalMode;
  else if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') proMode = !!window.professionalMode;

  // Czy mamy co pokazać?
  const lines = (isDocPro || proMode) ? getFormattedProfessionalSummaryLines() : [];
  const shouldShow = Array.isArray(lines) && lines.length > 0;

  // Czy „Ostatni pomiar” jest widoczny?
  const prevCard = document.getElementById('prevSummaryCard');
  const prevVisible = !!(prevCard && prevCard.style.display !== 'none');

  // Ukryj wszystko, jeśli nie ma czego wyświetlać
  if (!shouldShow) {
    removeClones();
    card.style.display = 'none';
    wrap.style.display = 'none';
    if (fullWrap) { fullWrap.style.display = 'none'; vildaAppClearHtml(fullWrap); }
    attachPatientReportActionToSummaryCard({ shouldShow: false, isDocPro, proMode, prevVisible });
    return;
  }

  const mid   = Math.ceil(lines.length / 2);
  const colA  = lines.slice(0, mid);
  const colB  = lines.slice(mid);

  // Render kolumny do <div class="current-summary-columns">
  function buildColumnRows(items) {
    const col = document.createElement('div');
    col.className = 'current-summary-col';
    items.forEach(txt => {
      const row = document.createElement('div');
      row.className = 'current-summary-row';
      // Apply colour coding: determine the colour based on the content of the original line.
      const colour = getProfessionalSummaryLineColor(txt);
      if (colour) {
        row.style.color = colour;
      }
      // Format decimal separator: replace dots with commas when between digits (e.g. 1.23 ➔ 1,23)
      const displayTxt = typeof txt === 'string' ? txt.replace(/(\d)\.(\d)/g, '$1,$2') : txt;
      row.textContent = displayTxt;
      col.appendChild(row);
    });
    return col;
  }
  function buildCard(items, id) {
    const c = document.createElement('div');
    c.className = 'card summary-card current-summary-card';
    if (id) c.id = id;
    const h = document.createElement('h3');
    h.style.margin = '0';
    h.textContent = 'Podsumowanie wyników';
    // Ustaw czarny kolor nagłówka (zamiast turkusowego)
    h.style.color = '#000';
    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'summary-content'; // zgodne z CSS kart
    const cols = document.createElement('div');
    cols.className = 'current-summary-columns';
    cols.appendChild(buildColumnRows(items));
    bodyDiv.appendChild(cols);

    // Dodaj etykietę PRO do klonowanej karty podsumowania (domyślnie ukrytą)
    const proLabel = document.createElement('div');
    proLabel.className = 'pro-summary-label';
    proLabel.style.display = 'none';
    proLabel.textContent = 'PRO';
    // Ustaw pozycjonowanie względne na karcie, aby etykieta mogła być umieszczona absolutnie
    c.style.position = 'relative';

    c.appendChild(h);
    c.appendChild(proLabel);
    c.appendChild(bodyDiv);
    // Jeśli aplikacja jest w trybie profesjonalnym (window.professionalMode === true),
    // nadaj od razu klasę i pokaż etykietę PRO dla tej karty podsumowania.
    try {
      if (window.professionalMode) {
        c.classList.add('pro-summary-card');
        proLabel.style.display = 'block';
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13334 });
    }
  }
    return c;
  }

  const isTwoColumn = window.innerWidth >= 700;

  if (prevVisible) {
    // ——— nowy układ w wersji desktopowej: lewa + prawa kolumna ———
    removeClones();

    if (isTwoColumn) {
      // Schowaj pojedynczą kartę i kontener pełnej szerokości
      card.style.display = 'none';
      if (fullWrap) { fullWrap.style.display = 'none'; vildaAppClearHtml(fullWrap); }

      // PRAWA kolumna: pod „Ostatnim pomiarem” ➔ używamy #currentSummaryWrap
      wrap.style.display = 'block';
      wrap.appendChild(buildCard(colB.length ? colB : colA, 'currentSummaryCardRight'));

      // LEWA kolumna: pod „Dane użytkownika”
      const leftCol =
        document.getElementById('userSection') ||                       // DocPro
        document.querySelector('#calcForm > .half:first-child') ||       // strona główna
        document.querySelector('.half');                                 // awaryjnie
      if (leftCol) {
        const leftCard = buildCard(colA.length ? colA : colB, 'currentSummaryCardLeft');
        const userFs = leftCol.querySelector('fieldset.user-card');
        if (userFs && userFs.parentNode) {
          userFs.parentNode.insertBefore(leftCard, userFs.nextSibling);
        } else {
          leftCol.appendChild(leftCard);
        }
      }

      // Po utworzeniu kart w układzie dwukolumnowym zadbaj o to,
      // aby wysokości obu kart podsumowania były identyczne.  W
      // mobilnym widoku funkcja adjustSummaryCardsHeight przywróci
      // naturalne wymiary kart.
      if (typeof window.adjustSummaryCardsHeight === 'function') {
        try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13375 });
    }
  }
      }
    } else {
      // Widok mobilny: zachowaj dotychczasowy układ „dwie karty poniżej”
      wrap.style.display = 'none';
      if (fullWrap) {
        // Wyczyść i zbuduj karty zanim kontener stanie się widoczny –
        // unikamy migotania starej treści lub pustego kontenera.
        vildaAppClearHtml(fullWrap);
        fullWrap.classList.add('current-summary-fullwrap');
        fullWrap.appendChild(buildCard(colA, 'currentSummaryCardLeft'));
        fullWrap.appendChild(buildCard(colB, 'currentSummaryCardRight'));
        fullWrap.style.display = 'block';
      } else {
        // DocPro nie ma #currentSummaryFullWrap – zbuduj karty przed pokazaniem wrap
        const fragDocPro = document.createDocumentFragment();
        fragDocPro.appendChild(buildCard(colA, 'currentSummaryCardLeft'));
        fragDocPro.appendChild(buildCard(colB, 'currentSummaryCardRight'));
        wrap.appendChild(fragDocPro);
        wrap.style.display = 'block';
      }
    }
  } else {
    // Brak „Ostatniego pomiaru”: jedna karta w prawej kolumnie (jak wcześniej)
    removeClones();
    if (fullWrap) { fullWrap.style.display = 'none'; vildaAppClearHtml(fullWrap); }
    // Wypełnij treść zanim karta stanie się widoczna – unikamy migotania
    // pustego pola (.card padding widoczne zanim content zostanie wyrenderowany).
    vildaAppClearHtml(content);
    const cols = document.createElement('div');
    cols.className = 'current-summary-columns';
    cols.appendChild(buildColumnRows(lines));
    content.appendChild(cols);
    wrap.style.display = 'block';
    card.style.display = 'block';
    // Po utworzeniu kart podsumowania w trybie desktopowym upewnij się,
    // że lewa i prawa karta podsumowania mają równą wysokość.  Funkcja
    // adjustSummaryCardsHeight ustawia wysokości obu kart w trybie
    // dwukolumnowym i resetuje style w trybie jednokolumnowym.
    if (typeof window.adjustSummaryCardsHeight === 'function') {
      try { window.adjustSummaryCardsHeight(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13410 });
    }
  }
    }
  }

  try {
    attachPatientReportActionToSummaryCard({ shouldShow, isDocPro, proMode, prevVisible, isTwoColumn });
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13416 });
    }
  }
}


function patientReportEscapeHtml(value) {
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

function patientReportFormatNumber(value, digits) {
  if (typeof value !== 'number' || !isFinite(value)) return '—';
  return value.toFixed(Number.isFinite(digits) ? digits : 1).replace('.', ',');
}

function patientReportDecodeCentile(value) {
  return String(value == null ? '' : value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function patientReportFormatPercentile(percentile) {
  if (typeof percentile !== 'number' || !isFinite(percentile)) return '—';
  if (typeof formatCentile === 'function') {
    try {
      const raw = formatCentile(percentile);
      const word = (typeof centylWord === 'function') ? centylWord(raw) : 'centyl';
      return `${patientReportDecodeCentile(raw)} ${word}`;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13447 });
    }
  }
  }
  return `${patientReportFormatNumber(percentile, 0)} centyl`;
}

function patientReportFormatAge(ageYears) {
  if (typeof ageYears !== 'number' || !isFinite(ageYears) || ageYears < 0) return '—';
  const months = Math.round(ageYears * 12);
  if (typeof advHistoryFormatAgeMonths === 'function') {
    try { return advHistoryFormatAgeMonths(months); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13456 });
    }
  }
  }
  const years = Math.floor(months / 12);
  const mos = months - (years * 12);
  return `${years} l. ${mos} mies.`;
}

function patientReportSanitizeFilename(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

const PATIENT_REPORT_ADULT_REFERENCE_AGE = 18;
const PATIENT_REPORT_ADULT_PDF_START_AGE = 19;
const PATIENT_REPORT_MODE_WINDOW_KEY = '__patientReportAgeMode';
const PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE = Object.freeze({
  WEIGHT_KG: 1.0,
  HEIGHT_CM: 1.0,
  BMI: 0.2
});

const PATIENT_REPORT_ADULT_HEIGHT_PL = {
  M: [
    { minAge: 19, maxAge: 29, ageLabel: '19–29 lat', p10: 173.0, p50: 179.0, p90: 186.5, bmi22WeightP10: 65.8, bmi22WeightP50: 70.5, bmi22WeightP90: 76.5 },
    { minAge: 30, maxAge: 59, ageLabel: '30–59 lat', p10: 170.0, p50: 178.0, p90: 185.0, bmi22WeightP10: 63.6, bmi22WeightP50: 69.7, bmi22WeightP90: 75.3 },
    { minAge: 60, maxAge: 74, ageLabel: '60–74 lat', p10: 168.0, p50: 176.0, p90: 183.0, bmi22WeightP10: 62.1, bmi22WeightP50: 68.1, bmi22WeightP90: 73.7 },
    { minAge: 75, maxAge: 200, ageLabel: '≥ 75 lat', p10: 167.0, p50: 174.5, p90: 180.0, bmi22WeightP10: 61.4, bmi22WeightP50: 67.0, bmi22WeightP90: 71.3 }
  ],
  F: [
    { minAge: 19, maxAge: 29, ageLabel: '19–29 lat', p10: 160.0, p50: 166.9, p90: 174.0, bmi22WeightP10: 56.3, bmi22WeightP50: 61.2, bmi22WeightP90: 66.6 },
    { minAge: 30, maxAge: 59, ageLabel: '30–59 lat', p10: 160.0, p50: 165.0, p90: 172.0, bmi22WeightP10: 56.3, bmi22WeightP50: 59.9, bmi22WeightP90: 65.1 },
    { minAge: 60, maxAge: 74, ageLabel: '60–74 lat', p10: 158.9, p50: 165.0, p90: 170.0, bmi22WeightP10: 55.5, bmi22WeightP50: 59.9, bmi22WeightP90: 63.6 },
    { minAge: 75, maxAge: 200, ageLabel: '≥ 75 lat', p10: 155.1, p50: 162.0, p90: 169.0, bmi22WeightP10: 52.9, bmi22WeightP50: 57.7, bmi22WeightP90: 62.8 }
  ]
};

const PATIENT_REPORT_ADULT_BMI_MEDIAN_PL = {
  M: [
    { minAge: 19, maxAge: 30, ageLabel: '18–30 lat', medianBmi: 24.52 },
    { minAge: 31, maxAge: 50, ageLabel: '31–50 lat', medianBmi: 25.18 },
    { minAge: 51, maxAge: 64, ageLabel: '51–64 lat', medianBmi: 26.79 },
    { minAge: 65, maxAge: 74, ageLabel: '65–74 lat', medianBmi: 27.10 },
    { minAge: 75, maxAge: 200, ageLabel: '≥ 75 lat', medianBmi: 26.70 }
  ],
  F: [
    { minAge: 19, maxAge: 30, ageLabel: '18–30 lat', medianBmi: 22.18 },
    { minAge: 31, maxAge: 50, ageLabel: '31–50 lat', medianBmi: 24.65 },
    { minAge: 51, maxAge: 64, ageLabel: '51–64 lat', medianBmi: 26.93 },
    { minAge: 65, maxAge: 74, ageLabel: '65–74 lat', medianBmi: 26.30 },
    { minAge: 75, maxAge: 200, ageLabel: '≥ 75 lat', medianBmi: 26.10 }
  ]
};

function patientReportGetCurrentMode() {
  try {
    if (typeof window !== 'undefined') {
      const mode = String(window[PATIENT_REPORT_MODE_WINDOW_KEY] || '').toLowerCase();
      if (mode === 'pdf') return 'pdf';
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13519 });
    }
  }
  return 'ui';
}

function patientReportRunWithMode(mode, callback) {
  if (typeof callback !== 'function') return null;
  const normalizedMode = String(mode || '').toLowerCase() === 'pdf' ? 'pdf' : 'ui';
  let hadPrev = false;
  let prevValue;
  try {
    if (typeof window !== 'undefined') {
      hadPrev = Object.prototype.hasOwnProperty.call(window, PATIENT_REPORT_MODE_WINDOW_KEY);
      prevValue = hadPrev ? window[PATIENT_REPORT_MODE_WINDOW_KEY] : undefined;
      window[PATIENT_REPORT_MODE_WINDOW_KEY] = normalizedMode;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13534 });
    }
  }
  try {
    return callback();
  } finally {
    try {
      if (typeof window !== 'undefined') {
        if (hadPrev) {
          window[PATIENT_REPORT_MODE_WINDOW_KEY] = prevValue;
        } else {
          delete window[PATIENT_REPORT_MODE_WINDOW_KEY];
        }
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13546 });
    }
  }
  }
}

function patientReportIsAdultAgeForMode(ageYears, mode) {
  const age = Number(ageYears);
  if (!isFinite(age)) return false;
  const threshold = String(mode || '').toLowerCase() === 'pdf'
    ? PATIENT_REPORT_ADULT_PDF_START_AGE
    : PATIENT_REPORT_ADULT_REFERENCE_AGE;
  return age >= threshold;
}

function patientReportIsAdultAgeForCurrentMode(ageYears) {
  return patientReportIsAdultAgeForMode(ageYears, patientReportGetCurrentMode());
}

function patientReportIsAdultPdfAge(ageYears) {
  return patientReportIsAdultAgeForMode(ageYears, 'pdf');
}

function patientReportGetCompletedYears(ageYears) {
  const age = Number(ageYears);
  if (!isFinite(age) || age < 0) return NaN;
  return Math.floor(age);
}

function patientReportGetAdultPopulationSexLabel(sex, options) {
  const female = String(sex || '').toUpperCase() === 'F';
  const label = female ? 'kobiet' : 'mężczyzn';
  const opts = options || {};
  return opts.capitalized ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
}

function patientReportGetAdultHeightPopulationRef(sex, ageYears) {
  const sexKey = String(sex || '').toUpperCase() === 'F' ? 'F' : 'M';
  const years = patientReportGetCompletedYears(ageYears);
  if (!isFinite(years)) return null;
  const bands = PATIENT_REPORT_ADULT_HEIGHT_PL[sexKey] || [];
  const match = bands.find((item) => years >= item.minAge && years <= item.maxAge);
  return match ? { ...match, sexKey } : null;
}

function patientReportGetAdultBmiMedianRef(sex, ageYears) {
  const sexKey = String(sex || '').toUpperCase() === 'F' ? 'F' : 'M';
  const years = patientReportGetCompletedYears(ageYears);
  if (!isFinite(years)) return null;
  const bands = PATIENT_REPORT_ADULT_BMI_MEDIAN_PL[sexKey] || [];
  const match = bands.find((item) => years >= item.minAge && years <= item.maxAge);
  return match ? { ...match, sexKey } : null;
}

function patientReportWeightForBmi(heightCm, bmi) {
  const height = Number(heightCm);
  const bmiValue = Number(bmi);
  if (!(isFinite(height) && height > 0 && isFinite(bmiValue) && bmiValue > 0)) return null;
  const heightM = height / 100;
  return bmiValue * heightM * heightM;
}

function patientReportResolveAdultHeightPosition(heightCm, sex, ageYears) {
  const reference = patientReportGetAdultHeightPopulationRef(sex, ageYears);
  const height = Number(heightCm);
  if (!reference || !(isFinite(height) && height > 0)) {
    return { available: false, reference };
  }
  let bandKey = '50-90';
  let badge = '50–90 centyl';
  if (height < reference.p10) {
    bandKey = '<10';
    badge = '<10 centyl';
  } else if (height < reference.p50) {
    bandKey = '10-50';
    badge = '10–50 centyl';
  } else if (height > reference.p90) {
    bandKey = '>90';
    badge = '>90 centyl';
  }
  return {
    available: true,
    height,
    p10: reference.p10,
    p50: reference.p50,
    p90: reference.p90,
    ageLabel: reference.ageLabel,
    sexGroupLabel: patientReportGetAdultPopulationSexLabel(sex),
    bandKey,
    badge,
    reference
  };
}

function patientReportIsAdultAge(ageYears) {
  const age = Number(ageYears);
  return isFinite(age) && age >= PATIENT_REPORT_ADULT_REFERENCE_AGE;
}

function patientReportGetReferenceAgeYears(ageYears) {
  const age = Number(ageYears);
  if (!isFinite(age) || age <= 0) return age;
  return patientReportIsAdultAge(age) ? PATIENT_REPORT_ADULT_REFERENCE_AGE : age;
}

function patientReportGetSexLabel(sex, ageYears) {
  const female = String(sex || '').toUpperCase() === 'F';
  if (patientReportIsAdultAge(ageYears)) {
    return female ? 'Kobieta' : 'Mężczyzna';
  }
  return female ? 'Dziewczynka' : 'Chłopiec';
}

function patientReportGetAgeReferenceLabel(ageYears, options) {
  const opts = options || {};
  const adultText = String(opts.adultText || 'dla dorosłych');
  const childText = String(opts.childText || 'dla tego wieku');
  return patientReportIsAdultAge(ageYears) ? adultText : childText;
}

function patientReportReplaceAdultReferenceText(value) {
  let text = String(value || '').trim();
  if (!text) return text;
  const replacements = [
    [/^Nie wszystkie najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci\.$/gi, 'Nie wszystkie najważniejsze wyniki mieszczą się obecnie w typowym zakresie.'],
    [/^Najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci\.$/gi, 'Najważniejsze wyniki mieszczą się obecnie w typowym zakresie.'],
    [/Wzrost znajduje się wyraźnie poniżej typowego zakresu dla wieku i płci\./gi, 'Wzrost znajduje się wyraźnie poniżej typowego zakresu względem siatek centylowych.'],
    [/Wzrost znajduje się w niskim zakresie centylowym dla wieku i płci\./gi, 'Wzrost znajduje się w niskim zakresie centylowym względem siatek centylowych.'],
    [/Wzrost wymaga interpretacji względem siatek centylowych dla wieku i płci\./gi, 'Wzrost wymaga interpretacji względem siatek centylowych.'],
    [/Taki układ wyników wymaga szczególnie uważnej oceny wzrastania i stanu odżywienia dziecka\./gi, 'Taki układ wyników wymaga szczególnie uważnej oceny stanu odżywienia i całościowego obrazu klinicznego.'],
    [/Szczególnie ważne jest porównanie obecnego wzrostu z wcześniejszymi pomiarami i oceną tempa wzrastania\./gi, 'Warto porównać obecny wzrost z wcześniejszymi pomiarami i interpretować wynik w szerszym kontekście klinicznym.'],
    [/Szczególnie ważna jest ocena tempa wzrastania w kolejnych pomiarach\./gi, 'Wynik warto interpretować w szerszym kontekście klinicznym.'],
    [/Równocześnie wzrost wymaga oceny względem siatek centylowych i tempa wzrastania\./gi, ''],
    [/Wynik warto interpretować także w odniesieniu do wzrostu rodziców i całego obrazu klinicznego\./gi, 'Wynik warto interpretować w odniesieniu do całego obrazu klinicznego.'],
    [/W takiej sytuacji równie ważna jak ocena masy ciała jest analiza tempa wzrastania i całego przebiegu wzrostu\./gi, 'W takiej sytuacji wynik warto interpretować łącznie z oceną stanu odżywienia i całego obrazu klinicznego.'],
    [/Taki wynik wymaga uważnej obserwacji tempa wzrastania i przyrostu masy ciała w czasie\./gi, 'Taki wynik wymaga kontroli masy ciała w kolejnych pomiarach i interpretacji klinicznej.'],
    [/w odniesieniu do wieku, płci i wzrostu/gi, 'w odniesieniu do płci, wzrostu i przyjętych norm'],
    [/w odniesieniu do wieku, wzrostu oraz warunków pomiaru/gi, 'w odniesieniu do wzrostu, warunków pomiaru i przyjętych norm'],
    [/w kontekście wieku i wzrostu/gi, 'w kontekście wzrostu i przyjętych norm'],
    [/norm dla wieku oraz warunków pomiaru/gi, 'przyjętych norm oraz warunków pomiaru'],
    [/norm dla wieku i warunków pomiaru/gi, 'przyjętych norm i warunków pomiaru'],
    [/siatek centylowych dla wieku i płci/gi, 'siatek centylowych'],
    [/typowym zakresie dla wieku i płci/gi, 'typowym zakresie'],
    [/typowych wartości dla wieku(?! 18 lat)/gi, 'typowych wartości względem przyjętych norm'],
    [/typowym zakresie dla wieku(?! 18 lat)/gi, 'typowym zakresie względem przyjętych norm'],
    [/norm dla wieku(?! 18 lat)/gi, 'przyjętych norm'],
    [/siatek centylowych dla wieku(?! 18 lat)/gi, 'siatek centylowych'],
    [/dla wieku i wzrostu/gi, 'względem przyjętych norm i wzrostu'],
    [/dla wieku(?! 18 lat)/gi, 'względem przyjętych norm']
  ];
  replacements.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text.replace(/\s{2,}/g, ' ').trim();
}

function patientReportAdaptHeadlineForAdultReference(headline) {
  const base = headline || {};
  return {
    ...base,
    title: patientReportReplaceAdultReferenceText(base.title),
    text: patientReportReplaceAdultReferenceText(base.text),
    subtext: patientReportReplaceAdultReferenceText(base.subtext)
  };
}

function patientReportAdaptHighlightsForAdultReference(highlights) {
  return (highlights || []).map((item) => ({
    ...(item || {}),
    text: patientReportReplaceAdultReferenceText(item && item.text)
  }));
}

function patientReportGetPreferredSource() {
  let resolved = '';
  try {
    if (typeof advHistoryGetPreferredSource === 'function') {
      resolved = String(advHistoryGetPreferredSource() || '').toUpperCase();
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13723 });
    }
  }
  if (!resolved) {
    try {
      if (typeof bmiSource !== 'undefined' && bmiSource) {
        resolved = String(bmiSource).toUpperCase();
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13729 });
    }
  }
  }
  if (!resolved) resolved = 'OLAF';
  try {
    const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : NaN;
    if (typeof patientReportIsAdultAge === 'function' && patientReportIsAdultAge(ageYears)) {
      return 'OLAF';
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13737 });
    }
  }
  return resolved;
}

function patientReportGetMetricMedian(metric, sex, ageYears, usedSource, resolved) {
  const src = String(usedSource || patientReportGetPreferredSource()).toUpperCase();
  if (resolved && resolved.result && typeof resolved.result.median === 'number' && isFinite(resolved.result.median)) {
    return resolved.result.median;
  }
  const months = Math.round(ageYears * 12);
  if (!isFinite(months) || months < 0) return null;
  try {
    if (src === 'PALCZEWSKA' && typeof getPalCentile === 'function') {
      const palMetric = metric === 'WT' ? 'WT' : (metric === 'HT' ? 'HT' : 'BMI');
      const median = getPalCentile(sex, months, 50, palMetric);
      return (typeof median === 'number' && isFinite(median)) ? median : null;
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13754 });
    }
  }
  return null;
}

function patientReportFormatCompactNumber(value, digits) {
  if (typeof value !== 'number' || !isFinite(value)) return '—';
  const precision = Number.isFinite(digits) ? Math.max(0, digits) : 1;
  const rounded = Number(value.toFixed(precision));
  return String(rounded).replace('.', ',');
}

function patientReportFormatScaleValue(value, unit, digits) {
  if (typeof value !== 'number' || !isFinite(value)) return '';
  const text = patientReportFormatCompactNumber(value, digits);
  return unit ? `${text} ${unit}` : text;
}

function patientReportLmsValueForPercentile(lms, percentile) {
  if (!Array.isArray(lms) || lms.length < 3 || typeof percentile !== 'number' || !isFinite(percentile)) return null;
  const [L, M, S] = lms;
  if (![L, M, S].every((value) => typeof value === 'number' && isFinite(value)) || M <= 0 || S <= 0) {
    return null;
  }
  const bounded = Math.min(99.9, Math.max(0.1, percentile));
  const z = (typeof normInv === 'function') ? normInv(bounded / 100) : null;
  if (typeof z !== 'number' || !isFinite(z)) return null;
  if (L !== 0) {
    const base = 1 + (L * S * z);
    if (base <= 0) return null;
    return M * Math.pow(base, 1 / L);
  }
  return M * Math.exp(S * z);
}

function patientReportGetPalMetricValueAtPercentile(metric, sex, ageYears, percentile) {
  if (typeof getPalCentile !== 'function' || typeof percentile !== 'number' || !isFinite(percentile)) return null;
  const months = Math.round(ageYears * 12);
  if (!isFinite(months) || months < 0) return null;
  const param = metric === 'WT' ? 'WT' : (metric === 'HT' ? 'HT' : 'BMI');
  try {
    const exact = getPalCentile(sex, months, percentile, param);
    if (typeof exact === 'number' && isFinite(exact)) return exact;
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 13796 });
    }
  }
  const anchors = [3, 10, 25, 50, 75, 90, 97]
    .map((centile) => ({ centile, value: getPalCentile(sex, months, centile, param) }))
    .filter((item) => typeof item.value === 'number' && isFinite(item.value))
    .sort((a, b) => a.centile - b.centile);
  if (anchors.length < 2) return null;

  let lower = anchors[0];
  let upper = anchors[1];
  if (percentile <= anchors[0].centile) {
    lower = anchors[0];
    upper = anchors[1];
  } else if (percentile >= anchors[anchors.length - 1].centile) {
    lower = anchors[anchors.length - 2];
    upper = anchors[anchors.length - 1];
  } else {
    for (let i = 0; i < anchors.length - 1; i += 1) {
      if (percentile >= anchors[i].centile && percentile <= anchors[i + 1].centile) {
        lower = anchors[i];
        upper = anchors[i + 1];
        break;
      }
    }
  }
  const span = upper.centile - lower.centile;
  if (!isFinite(span) || span === 0) return lower.value;
  const ratio = (percentile - lower.centile) / span;
  return lower.value + (ratio * (upper.value - lower.value));
}

function patientReportGetMetricValueAtPercentile(metric, sex, ageYears, percentile, usedSource) {
  const src = String(usedSource || patientReportGetPreferredSource()).toUpperCase();
  if (src === 'PALCZEWSKA') {
    return patientReportGetPalMetricValueAtPercentile(metric, sex, ageYears, percentile);
  }
  if (metric === 'BMI') {
    return patientReportLmsValueForPercentile(
      (typeof advHistoryGetBmiLMSForSource === 'function') ? advHistoryGetBmiLMSForSource(src, sex, ageYears) : null,
      percentile
    );
  }
  return patientReportLmsValueForPercentile(
    (typeof advHistoryGetChildLMSForSource === 'function') ? advHistoryGetChildLMSForSource(src, sex, ageYears, metric === 'WT' ? 'WT' : 'HT') : null,
    percentile
  );
}

function patientReportBuildScaleValueLabels(metric, sex, ageYears, usedSource) {
  const config = (metric === 'BMI')
    ? [
        { percentile: 5, unit: '' },
        { percentile: 95, unit: '' }
      ]
    : [
        { percentile: 3, unit: '' },
        { percentile: 97, unit: '' }
      ];

  return config.map((item) => {
    const value = patientReportGetMetricValueAtPercentile(metric, sex, ageYears, item.percentile, usedSource);
    if (typeof value !== 'number' || !isFinite(value)) return null;
    return {
      pos: item.percentile,
      label: patientReportFormatScaleValue(value, item.unit, 1)
    };
  }).filter(Boolean);
}

function patientReportBuildMedianReference(label, value, median, options) {
  const opts = options || {};
  const digits = Number.isFinite(opts.digits) ? opts.digits : 1;
  const medianUnit = String(opts.medianUnit == null ? (opts.unit || '') : opts.medianUnit);
  const diffUnit = String(opts.diffUnit == null ? (opts.unit || '') : opts.diffUnit);
  const baseLabel = String(opts.friendlyLabel || `Przeciętna ${String(label || '').toLowerCase()} dla tego wieku`);
  const unavailableText = String(opts.unavailableText || 'Brak porównania do typowej wartości dla wieku.');
  const exactText = String(opts.exactText || 'To dokładnie tyle, ile wynosi wartość odniesienia.');
  const nearText = String(opts.nearText || opts.equalText || 'To prawie tyle samo co wartość przeciętna.');
  const exactTolerance = Number.isFinite(opts.exactTolerance)
    ? Math.max(0, Number(opts.exactTolerance))
    : 0;
  const nearTolerance = Number.isFinite(opts.nearTolerance)
    ? Math.max(0, Number(opts.nearTolerance))
    : null;
  if (typeof value !== 'number' || !isFinite(value) || typeof median !== 'number' || !isFinite(median)) {
    return {
      available: false,
      label: baseLabel,
      medianText: unavailableText,
      diffText: '',
      neutral: true
    };
  }
  const addUnit = (val, unit) => {
    const formatted = patientReportFormatNumber(val, digits);
    return unit ? `${formatted} ${unit}` : formatted;
  };
  const diff = value - median;
  const abs = Math.abs(diff);
  const sameAfterRounding = patientReportFormatNumber(value, digits) === patientReportFormatNumber(median, digits);
  if (sameAfterRounding || (exactTolerance > 0 && abs <= exactTolerance)) {
    return {
      available: true,
      label: baseLabel,
      medianText: addUnit(median, medianUnit),
      diffText: exactText,
      neutral: true
    };
  }
  if (typeof nearTolerance === 'number' && abs <= nearTolerance) {
    return {
      available: true,
      label: baseLabel,
      medianText: addUnit(median, medianUnit),
      diffText: nearText,
      neutral: true
    };
  }
  const direction = diff > 0 ? 'powyżej tej wartości' : 'poniżej tej wartości';
  return {
    available: true,
    label: baseLabel,
    medianText: addUnit(median, medianUnit),
    diffText: `To o ${addUnit(abs, diffUnit)} ${direction}.`,
    neutral: false
  };
}

function patientReportToneColor(tone) {
  if (tone === 'danger') return '#c62828';
  if (tone === 'warn') return '#c75d00';
  return '#00838d';
}

function patientReportDescribeWeight(percentile, options) {
  const adultReference = !!(options && options.adultReference);
  if (typeof percentile !== 'number' || !isFinite(percentile)) return 'bez porównania centylowego';
  if (adultReference) {
    if (percentile < 3) return 'znacznie poniżej typowego zakresu w przyjętym odniesieniu centylowym';
    if (percentile < 10) return 'poniżej typowego zakresu w przyjętym odniesieniu centylowym';
    if (percentile < 90) return 'w typowym zakresie w przyjętym odniesieniu centylowym';
    if (percentile < 97) return 'powyżej typowego zakresu w przyjętym odniesieniu centylowym';
    return 'wyraźnie powyżej typowego zakresu w przyjętym odniesieniu centylowym';
  }
  if (percentile < 3) return 'znacznie poniżej typowego zakresu';
  if (percentile < 10) return 'poniżej typowego zakresu';
  if (percentile < 90) return 'w typowym zakresie dla wieku';
  if (percentile < 97) return 'powyżej typowego zakresu';
  return 'wyraźnie powyżej typowego zakresu';
}

function patientReportDescribeHeight(percentile, options) {
  const adultReference = !!(options && options.adultReference);
  if (typeof percentile !== 'number' || !isFinite(percentile)) return 'bez porównania centylowego';
  if (adultReference) {
    if (percentile <= 3) return 'wyraźnie poniżej typowego zakresu w przyjętym odniesieniu centylowym';
    if (percentile <= 10) return 'w niskim zakresie centylowym w przyjętym odniesieniu centylowym';
    if (percentile <= 90) return 'w typowym zakresie w przyjętym odniesieniu centylowym';
    if (percentile <= 97) return 'w wysokim zakresie centylowym w przyjętym odniesieniu centylowym';
    return 'wyraźnie powyżej typowego zakresu w przyjętym odniesieniu centylowym';
  }
  if (percentile <= 3) return 'wyraźnie poniżej typowego zakresu dla wieku';
  if (percentile <= 10) return 'w niskim zakresie centylowym dla wieku';
  if (percentile <= 90) return 'w typowym zakresie dla wieku';
  if (percentile <= 97) return 'w wysokim zakresie centylowym dla wieku';
  return 'wyraźnie powyżej typowego zakresu dla wieku';
}

function patientReportDescribeBmi(category) {
  const cat = String(category || '');
  if (!cat) return 'bez pełnej interpretacji';
  if (cat.includes('Otyłość')) return 'BMI wyraźnie powyżej typowego zakresu';
  if (cat === 'Nadwaga') return 'BMI powyżej typowego zakresu';
  if (cat === 'Niedowaga') return 'BMI poniżej typowego zakresu';
  return 'BMI w typowym zakresie';
}

function patientReportGetAdultBmiAssessment(bmi) {
  const defaultResult = {
    state: 'normal',
    tone: 'normal',
    badge: 'W zakresie',
    bmiNote: 'BMI mieści się w zakresie prawidłowym dla dorosłych.',
    weightNote: 'Ocena masy ciała u dorosłych opiera się przede wszystkim na BMI oraz na odniesieniu do masy referencyjnej dla wzrostu.',
    headlineTitle: '',
    headlineText: '',
    highlightText: ''
  };
  if (!(typeof bmi === 'number' && isFinite(bmi))) return defaultResult;
  if (bmi >= 40) {
    return {
      state: 'obesity-3',
      tone: 'danger',
      badge: 'Otyłość III stopnia',
      bmiNote: 'BMI wskazuje na otyłość III stopnia,',
      weightNote: 'Masa ciała odpowiada otyłości III stopnia w klasyfikacji BMI,',
      headlineTitle: 'BMI wskazuje na otyłość III stopnia.',
      headlineText: 'Wynik wymaga pilnej konsultacji lekarskiej.',
      highlightText: 'BMI wskazuje na otyłość III stopnia.'
    };
  }
  if (bmi >= 35) {
    return {
      state: 'obesity-2',
      tone: 'danger',
      badge: 'Otyłość II stopnia',
      bmiNote: 'BMI wskazuje na otyłość II stopnia,',
      weightNote: 'Masa ciała odpowiada otyłości II stopnia w klasyfikacji BMI,',
      headlineTitle: 'BMI wskazuje na otyłość II stopnia.',
      headlineText: 'Zalecana konsultacja lekarska.',
      highlightText: 'BMI wskazuje na otyłość II stopnia.'
    };
  }
  if (bmi >= 30) {
    return {
      state: 'obesity-1',
      tone: 'danger',
      badge: 'Otyłość I stopnia',
      bmiNote: 'BMI wskazuje na otyłość I stopnia,',
      weightNote: 'Masa ciała odpowiada otyłości I stopnia w klasyfikacji BMI,',
      headlineTitle: 'BMI wskazuje na otyłość I stopnia.',
      headlineText: 'Wynik warto omówić podczas konsultacji lekarskiej.',
      highlightText: 'BMI wskazuje na otyłość I stopnia.'
    };
  }
  if (bmi >= ADULT_BMI.OVER) {
    return {
      state: 'overweight',
      tone: 'warn',
      badge: 'Nadwaga',
      bmiNote: 'BMI wskazuje na nadwagę,',
      weightNote: 'Masa ciała odpowiada nadwadze w klasyfikacji BMI,',
      headlineTitle: 'BMI wskazuje na nadwagę.',
      headlineText: 'Warto rozważyć modyfikację nawyków żywieniowych i aktywności fizycznej. Zalecana konsultacja dietetyczna.',
      highlightText: 'BMI wskazuje na nadwagę.'
    };
  }
  if (bmi >= 24) {
    return {
      state: 'upper-normal',
      tone: 'warn',
      badge: 'Do obserwacji',
      bmiNote: 'BMI mieści się jeszcze w normie, jednak zbliża się do jej górnej granicy. Warto rozważyć modyfikację nawyków żywieniowych i stylu życia.',
      weightNote: 'Masa ciała jest jeszcze zgodna z prawidłowym BMI dla dorosłych, ale wynik zbliża się do górnej granicy normy.',
      headlineTitle: 'BMI mieści się jeszcze w normie, ale zbliża się do górnej granicy.',
      headlineText: 'To dobry moment, aby rozważyć modyfikację nawyków żywieniowych i stylu życia oraz obserwować trend kolejnych pomiarów.',
      highlightText: 'BMI mieści się jeszcze w normie, ale zbliża się do górnej granicy.'
    };
  }
  if (bmi < ADULT_BMI.UNDER) {
    return {
      state: 'underweight',
      tone: 'warn',
      badge: 'Niedowaga',
      bmiNote: 'BMI wskazuje na niedowagę,',
      weightNote: 'Masa ciała odpowiada niedowadze w klasyfikacji BMI,',
      headlineTitle: 'BMI wskazuje na niedowagę.',
      headlineText: 'Wynik warto interpretować w kontekście stanu odżywienia i ewentualnych przyczyn niedoboru masy ciała.',
      highlightText: 'BMI wskazuje na niedowagę.'
    };
  }
  return defaultResult;
}

function patientReportGetAdultHeightInfoNote(resolved) {
  if (!resolved || !resolved.available) {
    return 'Brak porównania do dorosłej populacji w Polsce dla tej grupy wieku.';
  }
  const groupText = `dorosłych ${resolved.sexGroupLabel} w Polsce w wieku ${resolved.ageLabel}`;
  if (resolved.bandKey === '<10') return `Wzrost jest poniżej 10. centyla ${groupText}.`;
  if (resolved.bandKey === '10-50') return `Wzrost mieści się między 10. a 50. centylem ${groupText}.`;
  if (resolved.bandKey === '50-90') return `Wzrost mieści się między 50. a 90. centylem ${groupText}.`;
  return `Wzrost jest powyżej 90. centyla ${groupText}.`;
}

function patientReportBuildAdultPopulationGroupText(sex, ageLabel) {
  const sexGroupLabel = patientReportGetAdultPopulationSexLabel(sex);
  const normalizedAgeLabel = String(ageLabel || '').trim();
  if (normalizedAgeLabel) {
    return `${sexGroupLabel} w wieku ${normalizedAgeLabel} w Polsce`;
  }
  return `${sexGroupLabel} w Polsce`;
}

function patientReportBuildAdultPopulationComparison(value, reference, options) {
  const opts = options || {};
  const digits = Number.isFinite(opts.digits) ? Number(opts.digits) : 1;
  const nearTolerance = Number.isFinite(opts.nearTolerance)
    ? Math.max(0, Number(opts.nearTolerance))
    : null;
  if (!(typeof value === 'number' && isFinite(value) && typeof reference === 'number' && isFinite(reference))) {
    return {
      available: false,
      state: 'unavailable',
      diff: null,
      absDiff: null,
      digits,
      formattedReference: '—',
      formattedDiff: '—'
    };
  }
  const diff = value - reference;
  const absDiff = Math.abs(diff);
  const sameAfterRounding = patientReportFormatNumber(value, digits) === patientReportFormatNumber(reference, digits);
  let state = diff > 0 ? 'above' : 'below';
  if (sameAfterRounding) {
    state = 'exact';
  } else if (typeof nearTolerance === 'number' && absDiff <= nearTolerance) {
    state = 'near';
  }
  return {
    available: true,
    state,
    diff,
    absDiff,
    digits,
    formattedReference: patientReportFormatNumber(reference, digits),
    formattedDiff: patientReportFormatNumber(absDiff, digits)
  };
}

function patientReportGetAdultHeightBandSummaryFragment(resolved) {
  if (!resolved || !resolved.available) return '';
  if (resolved.bandKey === '<10') return 'jest poniżej 10. centyla tej grupy';
  if (resolved.bandKey === '10-50') return 'mieści się między 10. a 50. centylem tej grupy';
  if (resolved.bandKey === '50-90') return 'mieści się między 50. a 90. centylem tej grupy';
  return 'jest powyżej 90. centyla tej grupy';
}

function patientReportBuildAdultWeightPopulationSummaryText(weight, height, sex, ageYears) {
  const bmiMedianRef = patientReportGetAdultBmiMedianRef(sex, ageYears);
  const peerWeight = bmiMedianRef ? patientReportWeightForBmi(height, bmiMedianRef.medianBmi) : null;
  const comparison = patientReportBuildAdultPopulationComparison(weight, peerWeight, {
    digits: 1,
    nearTolerance: PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.WEIGHT_KG
  });
  if (!comparison.available) {
    return 'brak porównania do dorosłej populacji w Polsce.';
  }
  const groupText = patientReportBuildAdultPopulationGroupText(sex, bmiMedianRef && bmiMedianRef.ageLabel);
  if (comparison.state === 'exact') {
    return `przy Twoim wzroście jest taka sama jak przeciętna masa ${groupText}.`;
  }
  if (comparison.state === 'near') {
    return `przy Twoim wzroście jest bardzo zbliżona do przeciętnej masy ${groupText}.`;
  }
  if (comparison.state === 'above') {
    return `przy Twoim wzroście jest o ${comparison.formattedDiff} kg wyższa niż przeciętna masa ${groupText}.`;
  }
  return `przy Twoim wzroście jest o ${comparison.formattedDiff} kg niższa niż przeciętna masa ${groupText}.`;
}

function patientReportBuildAdultHeightPopulationSummaryText(height, sex, ageYears) {
  const resolved = patientReportResolveAdultHeightPosition(height, sex, ageYears);
  const comparison = patientReportBuildAdultPopulationComparison(height, resolved && resolved.available ? resolved.p50 : null, {
    digits: 1,
    nearTolerance: PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.HEIGHT_CM
  });
  if (!resolved || !resolved.available || !comparison.available) {
    return 'brak porównania do dorosłej populacji w Polsce.';
  }
  const groupText = patientReportBuildAdultPopulationGroupText(sex, resolved.ageLabel);
  const bandFragment = patientReportGetAdultHeightBandSummaryFragment(resolved);
  if (comparison.state === 'exact') {
    return `jest dokładnie równy przeciętnemu wzrostowi ${groupText}.`;
  }
  if (comparison.state === 'near') {
    return `jest bardzo zbliżony do przeciętnego wzrostu ${groupText}.`;
  }
  if (comparison.state === 'above') {
    return `jest o ${comparison.formattedDiff} cm wyższy od przeciętnego wzrostu ${groupText} i ${bandFragment}.`;
  }
  return `jest o ${comparison.formattedDiff} cm niższy od przeciętnego wzrostu ${groupText} i ${bandFragment}.`;
}

function patientReportBuildAdultBmiPopulationSummaryText(bmi, sex, ageYears) {
  const bmiMedianRef = patientReportGetAdultBmiMedianRef(sex, ageYears);
  const comparison = patientReportBuildAdultPopulationComparison(bmi, bmiMedianRef && bmiMedianRef.medianBmi, {
    digits: 1,
    nearTolerance: PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.BMI
  });
  if (!comparison.available) {
    return 'brak porównania do dorosłej populacji w Polsce.';
  }
  const groupText = patientReportBuildAdultPopulationGroupText(sex, bmiMedianRef && bmiMedianRef.ageLabel);
  if (comparison.state === 'exact') {
    return `to dokładnie przeciętne BMI ${groupText}.`;
  }
  if (comparison.state === 'near') {
    return `to BMI bardzo zbliżone do przeciętnego BMI ${groupText}.`;
  }
  if (comparison.state === 'above') {
    return `to o ${comparison.formattedDiff} pkt więcej niż przeciętne BMI ${groupText}.`;
  }
  return `to o ${comparison.formattedDiff} pkt mniej niż przeciętne BMI ${groupText}.`;
}

function patientReportGetAdultBmiWeightDelta(weight, height) {
  if (!(typeof weight === 'number' && isFinite(weight) && weight > 0)) return null;
  if (!(typeof height === 'number' && isFinite(height) && height > 0)) return null;
  const heightM = height / 100;
  if (!(heightM > 0)) return null;
  const h2 = heightM * heightM;
  const bmiValue = (typeof BMI === 'function') ? BMI(weight, height) : (weight / h2);
  if (!(typeof bmiValue === 'number' && isFinite(bmiValue))) return null;
  const lowerWeight = ADULT_BMI.UNDER * h2;
  const upperWeight = 24.9 * h2;
  const kgToLower = Math.max(0, lowerWeight - weight);
  const kgAboveUpper = Math.max(0, weight - upperWeight);
  const kgToUpper = Math.max(0, upperWeight - weight);
  let state = 'normal';
  if (kgAboveUpper > 0.049) {
    state = 'above-normal';
  } else if (kgToLower > 0.049) {
    state = 'underweight';
  } else if (bmiValue >= 24) {
    state = 'upper-normal';
  }
  return {
    state,
    bmi: bmiValue,
    lowerWeight,
    upperWeight,
    kgToLower,
    kgAboveUpper,
    kgToUpper
  };
}

function patientReportBuildAdultBmiWeightDeltaSentence(weight, height, options) {
  const info = patientReportGetAdultBmiWeightDelta(weight, height);
  if (!info) return '';
  const opts = options || {};
  const digits = Number.isFinite(opts.digits) ? opts.digits : 1;
  const formatKg = (value) => `${patientReportFormatNumber(Math.max(0, value), digits)} kg`;
  const lowerStart = !!opts.lowercaseStart;
  const applyStartCase = (sentence) => {
    const value = String(sentence || '');
    if (!lowerStart || !value) return value;
    return value.charAt(0).toLowerCase() + value.slice(1);
  };
  if (info.state === 'above-normal') {
    const scopeLabel = opts.omitAdultQualifier ? '' : ' dla dorosłych';
    return applyStartCase(`Aby BMI wróciło do zakresu prawidłowego${scopeLabel}, należałoby zredukować masę ciała o ok. ${formatKg(info.kgAboveUpper)}.`);
  }
  if (info.state === 'underweight') {
    const scopeLabel = opts.omitAdultQualifier ? '' : ' dla dorosłych';
    if (opts.preferPlainNormalRange) {
      return applyStartCase(`Aby BMI wróciło do zakresu prawidłowego${scopeLabel}, należałoby zwiększyć masę ciała o ok. ${formatKg(info.kgToLower)}.`);
    }
    return applyStartCase(`Aby BMI osiągnęło dolną granicę zakresu prawidłowego${scopeLabel}, należałoby zwiększyć masę ciała o ok. ${formatKg(info.kgToLower)}.`);
  }
  if (info.state === 'upper-normal') {
    return applyStartCase(`Do górnej granicy zakresu prawidłowego BMI dla dorosłych pozostaje ok. ${formatKg(info.kgToUpper)}.`);
  }
  if (opts.includeNormalReserve) {
    return applyStartCase(`BMI mieści się w prawidłowym zakresie dla dorosłych. Do górnej granicy normy pozostaje ok. ${formatKg(info.kgToUpper)}.`);
  }
  return '';
}

function patientReportGetAdultBmiSummaryStatusLabel(state) {
  const normalized = String(state || '').trim();
  if (normalized === 'underweight') return 'niedowaga';
  if (normalized === 'overweight') return 'nadwaga';
  if (normalized === 'obesity-1') return 'otyłość I stopnia';
  if (normalized === 'obesity-2') return 'otyłość II stopnia';
  if (normalized === 'obesity-3') return 'otyłość III stopnia';
  if (normalized === 'upper-normal') return 'w zakresie prawidłowym dla dorosłych, ale blisko górnej granicy';
  return 'w zakresie prawidłowym dla dorosłych';
}

function patientReportScaleGradient() {
  return 'linear-gradient(90deg, #ffd7d7 0%, #ffc9c9 10%, #ffe4b8 17%, #d7f2f3 25%, #b3eaed 50%, #d7f2f3 75%, #ffe4b8 83%, #ffc9c9 90%, #ffd7d7 100%)';
}

function patientReportMapValueToScalePercent(value, minValue, maxValue) {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) ? maxValue : 100;
  if (!(typeof value === 'number' && isFinite(value)) || !isFinite(min) || !isFinite(max) || max <= min) return 0;
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

function patientReportBuildAdultBmiScaleModel(bmi) {
  if (!(typeof bmi === 'number' && isFinite(bmi))) return null;

  const min = 15;
  const max = 40;
  const thresholdUnder = 18.5;
  const thresholdUpperNormalWarn = 24;
  const thresholdOver = 25;
  const thresholdObesity1 = 30;
  const thresholdObesity2 = 35;
  const thresholdObesity3 = 40;

  const posUnder = patientReportMapValueToScalePercent(thresholdUnder, min, max);
  const posUpperNormalWarn = patientReportMapValueToScalePercent(thresholdUpperNormalWarn, min, max);
  const posOver = patientReportMapValueToScalePercent(thresholdOver, min, max);
  const posObesity1 = patientReportMapValueToScalePercent(thresholdObesity1, min, max);
  const posObesity2 = patientReportMapValueToScalePercent(thresholdObesity2, min, max);
  const posObesity3 = patientReportMapValueToScalePercent(thresholdObesity3, min, max);

  const gradient = `linear-gradient(90deg,
    #ffe4b8 0%, #ffe4b8 ${posUnder}%,
    #b3eaed ${posUnder}%, #b3eaed ${posUpperNormalWarn}%,
    #ffe9c8 ${posUpperNormalWarn}%, #ffe9c8 ${posOver}%,
    #ffd3a6 ${posOver}%, #ffd3a6 ${posObesity1}%,
    #ffc9c9 ${posObesity1}%, #ffc9c9 ${posObesity2}%,
    #ffb1b1 ${posObesity2}%, #ffb1b1 ${posObesity3}%
  )`;

  const makeTick = (value, safePos = null, digits = null) => ({
    pos: patientReportMapValueToScalePercent(value, min, max),
    label: patientReportFormatNumber(value, digits == null ? (value % 1 ? 1 : 0) : digits),
    safePos: safePos == null ? patientReportMapValueToScalePercent(value, min, max) : safePos
  });

  return {
    marker: patientReportMapValueToScalePercent(bmi, min, max),
    ticks: [
      makeTick(thresholdUnder, Math.max(8, posUnder), 1),
      makeTick(thresholdOver),
      makeTick(thresholdObesity1),
      makeTick(thresholdObesity2),
      makeTick(thresholdObesity3, 94.5)
    ],
    valueLabels: [
      { pos: patientReportMapValueToScalePercent((min + thresholdUnder) / 2, min, max), safePos: 8.5, label: 'Niedowaga' },
      { pos: patientReportMapValueToScalePercent((thresholdUnder + thresholdOver) / 2, min, max), safePos: 30.5, label: 'Norma' },
      { pos: patientReportMapValueToScalePercent((thresholdOver + thresholdObesity1) / 2, min, max), label: 'Nadwaga' },
      { pos: patientReportMapValueToScalePercent((thresholdObesity1 + max) / 2, min, max), safePos: 82, label: 'Otyłość' }
    ],
    gradient
  };
}

function patientReportBuildAdultHeightScaleModel(resolved) {
  if (!resolved || !resolved.available) return null;
  const p10 = Number(resolved.p10);
  const p50 = Number(resolved.p50);
  const p90 = Number(resolved.p90);
  const value = Number(resolved.height);
  if (![p10, p50, p90, value].every((item) => typeof item === 'number' && isFinite(item))) return null;

  const lowerStep = Math.max(1, p50 - p10);
  const upperStep = Math.max(1, p90 - p50);
  const min = Math.max(0, p10 - lowerStep);
  const max = p90 + upperStep;
  const pos10 = patientReportMapValueToScalePercent(p10, min, max);
  const pos50 = patientReportMapValueToScalePercent(p50, min, max);
  const pos90 = patientReportMapValueToScalePercent(p90, min, max);

  const gradient = `linear-gradient(90deg,
    #ffe4b8 0%, #ffe4b8 ${pos10}%,
    #d7f2f3 ${pos10}%, #d7f2f3 ${pos90}%,
    #ffe4b8 ${pos90}%, #ffe4b8 100%
  )`;

  const makeTick = (pos, label, safePos) => ({ pos, label, safePos });
  const makeValueLabel = (metricValue, safePos) => ({
    pos: patientReportMapValueToScalePercent(metricValue, min, max),
    safePos,
    label: patientReportFormatScaleValue(metricValue, 'cm', 1)
  });

  return {
    marker: patientReportMapValueToScalePercent(value, min, max),
    ticks: [
      makeTick(pos10, '10c', Math.max(10, pos10)),
      makeTick(pos50, '50c', pos50),
      makeTick(pos90, '90c', Math.min(90, pos90))
    ],
    valueLabels: [
      makeValueLabel(p10, Math.max(10, pos10)),
      makeValueLabel(p50, pos50),
      makeValueLabel(p90, Math.min(90, pos90))
    ],
    gradient
  };
}

function patientReportGetAdultBmiRangeKey(bmi) {
  if (!(typeof bmi === 'number' && isFinite(bmi))) return '';
  if (bmi < ADULT_BMI.UNDER) return 'underweight';
  if (bmi < ADULT_BMI.OVER) return 'normal';
  if (bmi < 30) return 'overweight';
  if (bmi < 35) return 'obesity-1';
  if (bmi < 40) return 'obesity-2';
  return 'obesity-3';
}

function patientReportBuildAdultBmiRangesTableHtml(bmi, tone) {
  const activeKey = patientReportGetAdultBmiRangeKey(bmi);
  const activeTone = String(tone || 'normal');
  const rows = [
    { key: 'underweight', label: 'Niedowaga', range: '< 18,5' },
    { key: 'normal', label: 'Norma', range: '18,5–24,9' },
    { key: 'overweight', label: 'Nadwaga', range: '25,0–29,9' },
    { key: 'obesity-1', label: 'Otyłość I°', range: '30,0–34,9' },
    { key: 'obesity-2', label: 'Otyłość II°', range: '35,0–39,9' },
    { key: 'obesity-3', label: 'Otyłość III°', range: '≥ 40,0' }
  ];

  const rowsHtml = rows.map((row) => {
    const activeClass = row.key === activeKey ? ` is-active tone-${patientReportEscapeHtml(activeTone)}` : '';
    return `
      <tr class="patient-report-bmi-ranges-row${activeClass}">
        <td>${patientReportEscapeHtml(row.label)}</td>
        <td class="patient-report-bmi-ranges-value">${patientReportEscapeHtml(row.range)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="patient-report-bmi-ranges-box">
      <div class="patient-report-bmi-ranges-title">Normy BMI dla dorosłych</div>
      <table class="patient-report-bmi-ranges-table" role="presentation" aria-hidden="true">
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function patientReportBuildScaleModel(type, percentile, valueLabels) {
  if (typeof percentile !== 'number' || !isFinite(percentile)) return null;
  const clamped = Math.max(0, Math.min(100, percentile));
  if (type === 'BMI') {
    return {
      marker: clamped,
      ticks: [
        { pos: 5, label: '5c', safePos: 7 },
        { pos: 50, label: '50c', safePos: 50 },
        { pos: 85, label: '85c', safePos: 85 },
        { pos: 95, label: '95c', safePos: 93 }
      ],
      valueLabels: Array.isArray(valueLabels) ? valueLabels : [],
      gradient: patientReportScaleGradient()
    };
  }
  return {
    marker: clamped,
    ticks: [
      { pos: 3, label: '3c', safePos: 6.5 },
      { pos: 50, label: '50c', safePos: 50 },
      { pos: 97, label: '97c', safePos: 93.5 }
    ],
    valueLabels: Array.isArray(valueLabels) ? valueLabels : [],
    gradient: patientReportScaleGradient()
  };
}

function patientReportCollectAllTrendPoints() {
  const points = [];
  try {
    if (typeof advGrowthCollectAllPointsForReport === 'function') {
      const collected = advGrowthCollectAllPointsForReport();
      if (Array.isArray(collected)) {
        collected.forEach((point) => {
          if (!point || typeof point.ageMonths !== 'number' || !isFinite(point.ageMonths)) return;
          points.push({
            ageMonths: point.ageMonths,
            weight: (typeof point.weight === 'number' && isFinite(point.weight)) ? point.weight : null,
            height: (typeof point.height === 'number' && isFinite(point.height)) ? point.height : null,
            current: point.pointType === 'current'
          });
        });
      }
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 14462 });
    }
  }

  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const currentAgeMonths = Math.round(ageYears * 12);
  const currentHeight = parseFloat(document.getElementById('height')?.value);
  const currentWeight = parseFloat(document.getElementById('weight')?.value);
  if (isFinite(currentAgeMonths) && currentAgeMonths >= 0 && (!isNaN(currentHeight) || !isNaN(currentWeight))) {
    const alreadyExists = points.some((point) => {
      if (point.ageMonths !== currentAgeMonths) return false;
      const sameHeight = (
        (point.height == null && isNaN(currentHeight)) ||
        (typeof point.height === 'number' && !isNaN(currentHeight) && Math.abs(point.height - currentHeight) < 0.05)
      );
      const sameWeight = (
        (point.weight == null && isNaN(currentWeight)) ||
        (typeof point.weight === 'number' && !isNaN(currentWeight) && Math.abs(point.weight - currentWeight) < 0.05)
      );
      return sameHeight && sameWeight;
    });
    if (!alreadyExists) {
      points.push({
        ageMonths: currentAgeMonths,
        weight: !isNaN(currentWeight) ? currentWeight : null,
        height: !isNaN(currentHeight) ? currentHeight : null,
        current: true
      });
    }
  }

  return points
    .slice()
    .sort((a, b) => a.ageMonths - b.ageMonths);
}

function patientReportBuildTrendSeries(points, key) {
  const series = [];
  (points || []).forEach((point, idx) => {
    let value = null;
    if (key === 'BMI') {
      if (typeof point.weight === 'number' && typeof point.height === 'number' && typeof BMI === 'function') {
        value = BMI(point.weight, point.height);
      }
    } else if (key === 'WT') {
      value = point.weight;
    } else if (key === 'HT') {
      value = point.height;
    }
    if (typeof value !== 'number' || !isFinite(value)) return;
    series.push({
      x: point.ageMonths,
      y: value,
      current: !!point.current,
      label: (typeof advHistoryFormatAgeMonths === 'function') ? advHistoryFormatAgeMonths(point.ageMonths) : `${Math.floor(point.ageMonths / 12)} l.`
    });
  });
  return series;
}

function patientReportBuildTrendPeriodLabel(monthsTotal) {
  const total = Math.max(0, Math.round(Number(monthsTotal) || 0));
  if (!isFinite(total) || total <= 0) return 'Od poprzedniego pomiaru';
  if (total === 1) return 'W ostatnim miesiącu';
  if (total === 12) return 'W okresie ostatniego roku';
  if (total < 7) return `W ostatnich ${total} miesiącach`;
  if (total < 12) return `W ciągu ostatnich ${total} miesięcy`;
  if (total % 12 === 0) {
    const years = total / 12;
    return `W okresie ostatnich ${years} lat`;
  }
  return `W ciągu ostatnich ${total} miesięcy`;
}

function patientReportBuildTrendDeltaText(series, unit, digits) {
  if (!Array.isArray(series) || series.length < 2) return '';
  const prev = series[series.length - 2];
  const last = series[series.length - 1];
  const diff = last.y - prev.y;
  const diffMonths = Math.round((last.x || 0) - (prev.x || 0));
  const periodLabel = patientReportBuildTrendPeriodLabel(diffMonths);
  const abs = patientReportFormatNumber(Math.abs(diff), Number.isFinite(digits) ? digits : 1);
  const unitText = String(unit || '').trim();
  if (Math.abs(diff) < 0.05) return `${periodLabel}: bez większej zmiany.`;
  return `${periodLabel}: ${diff > 0 ? '+' : '-'}${abs}${unitText ? ` ${unitText}` : ''}.`;
}

function patientReportBuildSparklineSvg(series, options) {
  if (!Array.isArray(series) || series.length < 2) return '';
  const opts = options || {};
  const width = 360;
  const height = 118;
  const padX = 14;
  const padY = 14;
  const bottomPad = 24;
  const xs = series.map((item) => item.x);
  const ys = series.map((item) => item.y);
  let minX = Math.min.apply(null, xs);
  let maxX = Math.max.apply(null, xs);
  let minY = Math.min.apply(null, ys);
  let maxY = Math.max.apply(null, ys);
  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) return '';
  if (maxX === minX) maxX = minX + 1;
  if (maxY === minY) {
    const delta = Math.max(1, Math.abs(maxY) * 0.05);
    minY -= delta;
    maxY += delta;
  }
  const plotW = width - (padX * 2);
  const plotH = height - padY - bottomPad;
  const toX = (x) => padX + ((x - minX) / (maxX - minX)) * plotW;
  const toY = (y) => padY + (1 - ((y - minY) / (maxY - minY))) * plotH;
  const path = series.map((item, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(item.x).toFixed(2)} ${toY(item.y).toFixed(2)}`).join(' ');
  const areaPath = `${path} L ${toX(series[series.length - 1].x).toFixed(2)} ${(padY + plotH).toFixed(2)} L ${toX(series[0].x).toFixed(2)} ${(padY + plotH).toFixed(2)} Z`;
  const last = series[series.length - 1];
  const first = series[0];
  const circles = series.map((item) => {
    const cx = toX(item.x).toFixed(2);
    const cy = toY(item.y).toFixed(2);
    const r = item.current ? 4.8 : 3.4;
    const fill = item.current ? '#7c3aed' : '#00838d';
    const stroke = item.current ? '#ffffff' : '#e8f6f6';
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
  }).join('');
  const minLabel = patientReportEscapeHtml(first.label || '');
  const maxLabel = patientReportEscapeHtml(last.label || '');
  const valueLabel = patientReportEscapeHtml(`${patientReportFormatNumber(last.y, Number.isFinite(opts.digits) ? opts.digits : 1)} ${opts.unit || ''}`.trim());
  const gradientId = `patientSparkFill_${Math.random().toString(36).slice(2, 10)}`;
  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trend ${patientReportEscapeHtml(opts.title || '')}">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00838d" stop-opacity="0.24" />
          <stop offset="100%" stop-color="#00838d" stop-opacity="0.03" />
        </linearGradient>
      </defs>
      <line x1="${padX}" y1="${(padY + plotH).toFixed(2)}" x2="${(padX + plotW).toFixed(2)}" y2="${(padY + plotH).toFixed(2)}" stroke="#d6e7e7" stroke-width="1.5" />
      <path d="${areaPath}" fill="url(#${gradientId})" stroke="none" />
      <path d="${path}" fill="none" stroke="#00838d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${circles}
      <text x="${padX}" y="${height - 5}" font-size="12" fill="#6b7d7d">${minLabel}</text>
      <text x="${padX + plotW}" y="${height - 5}" font-size="12" fill="#6b7d7d" text-anchor="end">${maxLabel}</text>
      <rect x="${width - 112}" y="6" width="104" height="20" rx="10" fill="#f4f7fb" stroke="#dbe7f2" />
      <text x="${width - 60}" y="20" font-size="11.5" fill="#37556a" text-anchor="middle">${valueLabel}</text>
    </svg>`;
}

function patientReportSplitSummaryLine(line) {
  const raw = String(line || '').trim();
  const idx = raw.indexOf(':');
  if (idx <= 0) {
    return { label: raw, value: '' };
  }
  return {
    label: raw.slice(0, idx).trim(),
    value: raw.slice(idx + 1).trim()
  };
}

function patientReportGroupSummaryLines(lines) {
  const groups = [
    { key: 'main', title: 'Waga, wzrost i BMI', intro: 'Najważniejsze wskaźniki z bieżącego pomiaru.', items: [] },
    { key: 'body', title: 'Obwody i proporcje ciała', intro: 'Pomocnicze pomiary budowy ciała.', items: [] },
    { key: 'cardio', title: 'Ciśnienie i dodatkowe pomiary', intro: 'Pomiary dodatkowe wykonane podczas wizyty.', items: [] },
    { key: 'growth', title: 'Tempo wzrastania i potencjał', intro: 'Wskaźniki przydatne w ocenie wzrastania w czasie.', items: [] },
    { key: 'other', title: 'Pozostałe wyniki', intro: 'Dodatkowe informacje z części profesjonalnej.', items: [] }
  ];
  const pickGroup = (line) => {
    const lc = String(line || '').toLowerCase();
    if (lc.startsWith('waga') || lc.startsWith('wzrost') || lc.startsWith('bmi') || lc.startsWith('pow. ciała') || lc.startsWith('wskaźnik cole')) return 'main';
    if (lc.startsWith('obwód talii') || lc.startsWith('obwód bioder') || lc.startsWith('whr')) return 'body';
    if (lc.startsWith('rr ') || lc.startsWith('ciśnienie') || lc.startsWith('obwód głowy') || lc.startsWith('obwód kl.')) return 'cardio';
    if (lc.startsWith('aktualne tempo') || lc.startsWith('tempo wzrastania') || lc.startsWith('mph') || lc.startsWith('hsds')) return 'growth';
    return 'other';
  };
  (lines || []).forEach((line) => {
    const groupKey = pickGroup(line);
    const group = groups.find((item) => item.key === groupKey) || groups[groups.length - 1];
    const split = patientReportSplitSummaryLine(line);
    group.items.push({
      raw: line,
      label: split.label,
      value: split.value,
      tone: getProfessionalSummaryLineTone(line)
    });
  });
  return groups.filter((group) => group.items.length);
}

function patientReportCollectHighlights(lines) {
  const out = [];
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : NaN;
  const isAdultPatient = (typeof patientReportIsAdultAgeForCurrentMode === 'function')
    ? patientReportIsAdultAgeForCurrentMode(ageYears)
    : ((typeof patientReportIsAdultAge === 'function')
      ? patientReportIsAdultAge(ageYears)
      : (isFinite(ageYears) && ageYears >= 18));
  const weightNow = parseFloat(document.getElementById('weight')?.value) || 0;
  const heightNow = parseFloat(document.getElementById('height')?.value) || 0;
  const adultBmiNow = (isAdultPatient && heightNow > 0 && weightNow > 0 && typeof BMI === 'function')
    ? BMI(weightNow, heightNow)
    : null;
  const adultBmiAssessment = isAdultPatient ? patientReportGetAdultBmiAssessment(adultBmiNow) : null;
  const add = (text, tone) => {
    if (!text) return;
    if (out.some((item) => item.text === text)) return;
    out.push({ text, tone: tone || 'warn' });
  };
  (lines || []).forEach((line) => {
    const tone = getProfessionalSummaryLineTone(line);
    if (tone === 'normal') return;
    const lc = String(line || '').toLowerCase();
    if (isAdultPatient) {
      if (lc.startsWith('wzrost') || lc.startsWith('tempo wzrastania') || lc.startsWith('aktualne tempo') || lc.startsWith('mph') || lc.startsWith('hsds')) return;
      if (lc.startsWith('waga') || lc.startsWith('bmi')) {
        const text = adultBmiAssessment && adultBmiAssessment.highlightText
          ? adultBmiAssessment.highlightText
          : 'Ocena masy ciała u dorosłych powinna być interpretowana przede wszystkim łącznie z BMI.';
        add(text, adultBmiAssessment && adultBmiAssessment.tone ? adultBmiAssessment.tone : tone);
        return;
      }
    }
    if (lc.startsWith('bmi')) add('BMI wymaga omówienia w kontekście wieku i wzrostu.', tone);
    else if (lc.startsWith('waga')) add('Masa ciała jest poza typowym zakresem dla wieku.', tone);
    else if (lc.startsWith('wzrost')) add('Wzrost znajduje się poza typowym zakresem centylowym.', tone);
    else if (lc.startsWith('rr ') || lc.startsWith('ciśnienie')) add('Ciśnienie tętnicze wymaga kontroli w kolejnych pomiarach.', tone);
    else if (lc.startsWith('whr')) add('Rozkład tkanki tłuszczowej warto oceniać łącznie z innymi wynikami.', tone);
    else if (lc.startsWith('wskaźnik cole')) add('Wskaźnik Cole’a pomaga ocenić masę ciała względem wzrostu.', tone);
    else if (lc.startsWith('tempo wzrastania') || lc.startsWith('aktualne tempo')) add('Tempo wzrastania trzeba interpretować w odniesieniu do czasu między pomiarami.', tone);
    else if (lc.startsWith('mph') || lc.startsWith('hsds')) add('Wzrost warto oceniać także względem potencjału rodzinnego.', tone);
  });
  return out.slice(0, 4);
}

function patientReportHeadlineIssueGroupKey(line) {
  const lc = String(line || '').toLowerCase().trim();
  if (!lc) return '';
  if (lc.startsWith('rr ') || lc.startsWith('ciśnienie')) return 'blood-pressure';
  if (lc.startsWith('tętno') || lc.startsWith('hr ')) return 'heart-rate';
  if (lc.startsWith('waga') || lc.startsWith('bmi') || lc.startsWith('wskaźnik cole')) return 'body-mass';
  if (lc.startsWith('wzrost') || lc.startsWith('tempo wzrastania') || lc.startsWith('aktualne tempo') || lc.startsWith('mph') || lc.startsWith('hsds')) return 'growth';
  if (lc.startsWith('whr')) return 'fat-distribution';
  const split = patientReportSplitSummaryLine(line);
  const label = String((split && split.label) || '').toLowerCase().trim();
  return label || lc;
}

function patientReportCollectFlaggedSummaryItems(summaryLines) {
  const flagged = [];
  (summaryLines || []).forEach((line) => {
    const tone = getProfessionalSummaryLineTone(line);
    if (tone === 'normal') return;
    flagged.push({
      line,
      tone,
      lc: String(line || '').toLowerCase(),
      split: patientReportSplitSummaryLine(line),
      group: patientReportHeadlineIssueGroupKey(line)
    });
  });
  return flagged;
}

function patientReportAppendSentence(base, addition) {
  const current = String(base || '').trim();
  const extra = String(addition || '').trim();
  if (!current) return extra;
  if (!extra) return current;
  return `${current} ${extra}`;
}

function patientReportEnsureSentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const normalized = text.replace(/[\s,;:]+$/, '');
  if (!normalized) return '';
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function patientReportFormatIssueList(parts) {
  const items = (parts || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} oraz ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} oraz ${items[items.length - 1]}`;
}

function patientReportBuildAdditionalIssueSentence(flaggedItems, excludedGroups) {
  const excluded = new Set(Array.isArray(excludedGroups) ? excludedGroups.filter(Boolean) : []);
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : NaN;
  const isAdultPatient = (typeof patientReportIsAdultAgeForCurrentMode === 'function')
    ? patientReportIsAdultAgeForCurrentMode(ageYears)
    : ((typeof patientReportIsAdultAge === 'function')
      ? patientReportIsAdultAge(ageYears)
      : (isFinite(ageYears) && ageYears >= 18));
  const basics = (typeof patientReportGetCurrentBasics === 'function') ? patientReportGetCurrentBasics() : null;
  const adultBmiAssessment = isAdultPatient ? patientReportGetAdultBmiAssessment(basics && basics.bmi) : null;
  const extras = [];
  (flaggedItems || []).forEach((item) => {
    const key = String(item && item.group || '').trim();
    if (!key || excluded.has(key) || extras.includes(key)) return;
    if (isAdultPatient && key === 'growth') return;
    extras.push(key);
  });
  if (!extras.length) return '';

  if (extras.length === 1) {
    const key = extras[0];
    if (key === 'blood-pressure') {
      return isAdultPatient
        ? 'Równocześnie wynik ciśnienia tętniczego wymaga potwierdzenia w kolejnych pomiarach.'
        : 'Równocześnie ciśnienie tętnicze wymaga dalszej kontroli i interpretacji w kolejnych pomiarach.';
    }
    if (key === 'heart-rate') {
      return isAdultPatient
        ? 'Równocześnie tętno spoczynkowe należy interpretować łącznie z objawami, aktywnością i stosowanymi lekami.'
        : 'Równocześnie tętno wymaga odniesienia do norm dla wieku i warunków pomiaru.';
    }
    if (key === 'growth') {
      return 'Równocześnie wzrost wymaga oceny względem siatek centylowych i tempa wzrastania.';
    }
    if (key === 'body-mass') {
      if (isAdultPatient) {
        if (adultBmiAssessment && adultBmiAssessment.state === 'upper-normal') {
          return 'Równocześnie BMI mieści się jeszcze w normie, ale zbliża się do górnej granicy.';
        }
        if (adultBmiAssessment && (adultBmiAssessment.state === 'overweight' || String(adultBmiAssessment.state || '').startsWith('obesity'))) {
          return 'Równocześnie BMI wskazuje na nadmiar masy ciała.';
        }
        if (adultBmiAssessment && adultBmiAssessment.state === 'underweight') {
          return 'Równocześnie BMI wskazuje na niedowagę.';
        }
        return 'Równocześnie masę ciała u dorosłych warto interpretować przede wszystkim łącznie z BMI.';
      }
      const bodyMassItems = (flaggedItems || []).filter((item) => item && item.group === 'body-mass');
      const hasColeOnly = bodyMassItems.some((item) => item.lc.startsWith('wskaźnik cole'))
        && !bodyMassItems.some((item) => item.lc.startsWith('bmi') || item.lc.startsWith('waga'));
      if (hasColeOnly) {
        return 'Równocześnie wskaźnik Cole’a jest poza typowym zakresem i warto interpretować go łącznie z BMI oraz wzrostem.';
      }
      return 'Równocześnie parametry masy ciała są poza typowym zakresem dla wieku.';
    }
    if (key === 'fat-distribution') {
      return 'Równocześnie rozkład tkanki tłuszczowej wymaga dodatkowej oceny wraz z pozostałymi wynikami.';
    }
    return 'Równocześnie dodatkowej oceny wymaga jeszcze jeden parametr z podsumowania.';
  }

  const labels = extras.map((key) => {
    if (key === 'blood-pressure') return 'ciśnienie tętnicze';
    if (key === 'heart-rate') return isAdultPatient ? 'tętno spoczynkowe' : 'tętno';
    if (key === 'growth') return 'wzrost';
    if (key === 'body-mass') return isAdultPatient ? 'masa ciała i BMI' : 'parametry masy ciała';
    if (key === 'fat-distribution') return 'rozkład tkanki tłuszczowej';
    return 'inne parametry z podsumowania';
  });
  return `Równocześnie dodatkowej oceny wymagają ${patientReportFormatIssueList(labels)}.`;
}

function patientReportBuildFlaggedSummaryHeadline(summaryLines) {
  const flagged = patientReportCollectFlaggedSummaryItems(summaryLines);
  if (!flagged.length) return null;

  const basics = (typeof patientReportGetCurrentBasics === 'function') ? patientReportGetCurrentBasics() : null;
  const isAdultPatient = !!(basics && basics.isAdult);
  const adultBmiAssessment = isAdultPatient ? patientReportGetAdultBmiAssessment(basics && basics.bmi) : null;
  const hasDanger = flagged.some((item) => item.tone === 'danger');
  const first = flagged.find((item) => item.tone === 'danger') || flagged[0];
  let badge = hasDanger ? 'Wynik nieprawidłowy' : 'Wymaga omówienia';
  let tone = hasDanger ? 'danger' : 'warn';
  let title = 'Nie wszystkie najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci.';
  let text = '';
  let subtext = '';

  if (isAdultPatient && (first.lc.startsWith('waga') || first.lc.startsWith('bmi')) && adultBmiAssessment && adultBmiAssessment.state && adultBmiAssessment.state !== 'normal') {
    badge = adultBmiAssessment.badge || badge;
    tone = adultBmiAssessment.tone || tone;
    title = adultBmiAssessment.headlineTitle || title;
    text = adultBmiAssessment.headlineText || '';
    subtext = '';
  } else if (first.lc.startsWith('wskaźnik cole')) {
    const mCole = first.line.match(/([\d]+(?:[\.,]\d+)?)\s*%/);
    const coleVal = mCole ? parseFloat(String(mCole[1]).replace(',', '.')) : null;
    const coleInfo = patientReportClassifyCole(coleVal);
    if (coleInfo && coleInfo.category === 'Nadwaga') {
      title = 'Wskaźnik Cole’a wskazuje obecnie na nadwagę.';
      text = 'Pomimo tego, że waga i BMI są jeszcze w normie, wskaźnik Cole’a może być pierwszym sygnałem nadwagi u dziecka.';
    } else if (coleInfo && coleInfo.category === 'Otyłość') {
      title = 'Wskaźnik Cole’a wskazuje obecnie na otyłość.';
      text = 'Oznacza to, że masa ciała względem wzrostu i wieku jest wyraźnie powyżej typowego zakresu.';
      badge = 'Wynik nieprawidłowy';
      tone = 'danger';
    } else if (coleInfo && coleInfo.category === 'Niedowaga') {
      title = 'Wskaźnik Cole’a wskazuje obecnie na niedowagę.';
      text = 'Oznacza to, że masa ciała względem wzrostu i wieku jest poniżej typowego zakresu.';
    } else {
      text = 'Wskaźnik Cole’a wymaga omówienia w odniesieniu do wieku, płci i wzrostu.';
    }
    subtext = '';
  } else if (first.lc.startsWith('waga')) {
    title = 'Masa ciała znajduje się obecnie poza typowym zakresem dla wieku.';
    text = 'Wynik należy interpretować łącznie z wzrostem, BMI i przebiegiem wcześniejszych pomiarów.';
  } else if (first.lc.startsWith('wzrost')) {
    title = 'Wzrost wymaga interpretacji względem siatek centylowych dla wieku i płci.';
    text = 'Taki wynik warto oceniać razem z tempem wzrastania i danymi z wcześniejszych wizyt.';
  } else if (first.lc.startsWith('bmi')) {
    title = 'BMI wymaga obecnie dodatkowego omówienia.';
    text = 'Oznacza to, że nie wszystkie parametry z bieżącego pomiaru mieszczą się w typowym zakresie dla wieku i płci.';
  } else if (first.lc.startsWith('rr ') || first.lc.startsWith('ciśnienie')) {
    if (isAdultPatient && window.adultVitalsApi && typeof window.adultVitalsApi.getState === 'function' && typeof window.adultVitalsApi.classifyBloodPressure === 'function') {
      const state = window.adultVitalsApi.getState();
      const hasInput = (window.adultVitalsApi && typeof window.adultVitalsApi.hasAnyMeasurement === 'function')
        ? window.adultVitalsApi.hasAnyMeasurement(state)
        : false;
      const guidelineKey = hasInput ? state.guidelineKey : 'ESC';
      const info = window.adultVitalsApi.classifyBloodPressure(state.sbp, state.dbp, guidelineKey);
      if (info && info.key && info.key !== 'normal' && info.key !== 'missing' && info.key !== 'partial') {
        badge = info.badge || badge;
        tone = info.tone || tone;
        title = info.headlineTitle || 'Ciśnienie tętnicze wymaga obecnie kontroli.';
        text = info.headlineText || 'Wynik znajduje się poza typowym zakresem dla dorosłych.';
      } else {
        title = 'Ciśnienie tętnicze u dorosłych należy oceniać w kolejnych pomiarach.';
        text = 'Pojedynczy odczyt warto interpretować w warunkach pełnego spoczynku i potwierdzić w kolejnych pomiarach.';
      }
    } else {
      title = 'Ciśnienie tętnicze wymaga obecnie kontroli i interpretacji w kolejnych pomiarach.';
      text = 'Uzyskany pomiar należy oceniać w odniesieniu do wieku, wzrostu oraz warunków pomiaru.';
    }
  } else if (first.lc.startsWith('tętno')) {
    if (isAdultPatient && window.adultVitalsApi && typeof window.adultVitalsApi.getState === 'function' && typeof window.adultVitalsApi.classifyHeartRate === 'function') {
      const state = window.adultVitalsApi.getState();
      const info = window.adultVitalsApi.classifyHeartRate(state.hr, { athlete: state.athlete, betaBlocker: state.betaBlocker });
      if (info && info.key && info.key !== 'normal' && info.key !== 'missing') {
        badge = info.badge || badge;
        tone = info.tone || tone;
        title = info.headlineTitle || 'Tętno spoczynkowe wymaga obecnie kontroli.';
        text = info.headlineText || 'Wynik odbiega od typowego zakresu tętna spoczynkowego dla dorosłych.';
      } else {
        title = 'Tętno spoczynkowe u dorosłych należy oceniać w pełnym spoczynku.';
        text = 'Do interpretacji potrzebny jest rzeczywisty pomiar tętna spoczynkowego oraz kontekst kliniczny.';
      }
    }
  } else if (first.lc.startsWith('whr')) {
    title = 'Rozkład tkanki tłuszczowej wymaga dodatkowej oceny.';
    text = 'Wynik warto interpretować łącznie z masą ciała, BMI i obwodem talii.';
  } else if (first.lc.startsWith('tempo wzrastania') || first.lc.startsWith('aktualne tempo')) {
    title = 'Tempo wzrastania wymaga obecnie uważniejszej obserwacji.';
    text = 'Najwięcej informacji daje porównanie kilku kolejnych pomiarów w czasie.';
  } else if (first.lc.startsWith('mph') || first.lc.startsWith('hsds')) {
    title = 'Wzrost warto odnieść również do potencjału rodzinnego.';
    text = 'Ten wynik nie mieści się w pełni w typowym zakresie i powinien być interpretowany razem z pozostałymi danymi.';
  }

  if (!text) {
    const label = String((first.split && first.split.label) || '').trim();
    text = label
      ? `Szczególnej uwagi wymaga parametr: ${label}.`
      : 'Wynik wymaga omówienia w kontekście całego badania.';
  }

  text = patientReportAppendSentence(text, patientReportBuildAdditionalIssueSentence(flagged, [first.group]));

  return {
    badge,
    tone,
    title,
    text,
    subtext,
    primaryGroup: first.group,
    issueGroups: Array.from(new Set(flagged.map((item) => item.group).filter(Boolean)))
  };
}

function patientReportGetWeightDirectionFromPercentile(percentile) {
  if (typeof percentile !== 'number' || !isFinite(percentile)) return '';
  if (percentile < 10) return 'low';
  if (percentile >= 90) return 'high';
  return 'normal';
}

function patientReportGetBmiDirectionFromCategory(category) {
  const kind = patientReportNormalizeBmiCategory(category);
  if (kind === 'underweight') return 'low';
  if (kind === 'overweight' || kind === 'obesity') return 'high';
  if (kind === 'normal') return 'normal';
  return '';
}

function patientReportDescribeBodyMassHeadlineTarget(metrics, direction) {
  const list = Array.isArray(metrics) ? metrics : [];
  const weightCard = list.find((item) => item && item.key === 'WT') || null;
  const bmiCard = list.find((item) => item && item.key === 'BMI') || null;
  const weightDirection = patientReportGetWeightDirectionFromPercentile(weightCard && weightCard.percentile);
  const bmiDirection = patientReportGetBmiDirectionFromCategory(bmiCard && bmiCard.category);
  const includeWeight = weightDirection === direction;
  const includeBmi = bmiDirection === direction;

  if (includeWeight && includeBmi) {
    return {
      subject: 'Masa ciała i BMI',
      inlineSubject: 'masa ciała i BMI',
      verb: 'są',
      count: 2,
      weightDirection,
      bmiDirection
    };
  }
  if (includeWeight) {
    return {
      subject: 'Masa ciała',
      inlineSubject: 'masa ciała',
      verb: 'jest',
      count: 1,
      weightDirection,
      bmiDirection
    };
  }
  if (includeBmi) {
    return {
      subject: 'BMI',
      inlineSubject: 'BMI',
      verb: 'jest',
      count: 1,
      weightDirection,
      bmiDirection
    };
  }
  return {
    subject: 'Parametry masy ciała',
    inlineSubject: 'parametry masy ciała',
    verb: 'są',
    count: 0,
    weightDirection,
    bmiDirection
  };
}

function patientReportBuildBodyMassRangeSentence(metrics, direction, options) {
  const opts = options || {};
  const target = patientReportDescribeBodyMassHeadlineTarget(metrics, direction);
  const subject = opts.inline ? target.inlineSubject : target.subject;
  const modifier = String(opts.modifier || '').trim();
  const defaultRangeText = direction === 'high'
    ? 'powyżej typowego zakresu dla wieku'
    : 'poniżej typowego zakresu dla wieku';
  const rangeText = String(opts.rangeText || defaultRangeText).trim();
  return `${subject} ${target.verb}${modifier ? ` ${modifier}` : ''} ${rangeText}`.replace(/\s+/g, ' ').trim();
}

function patientReportBuildHeadline(metrics, historyCount, highlights, summaryLines) {
  const bmiCard = metrics.find((item) => item.key === 'BMI') || null;
  const heightCard = metrics.find((item) => item.key === 'HT') || null;
  const bmiCategory = String((bmiCard && bmiCard.category) || '');
  const bmiKind = patientReportNormalizeBmiCategory(bmiCategory);
  const basics = (typeof patientReportGetCurrentBasics === 'function') ? patientReportGetCurrentBasics() : null;
  const isAdultPatient = !!(basics && basics.isAdult);
  const adultBmiAssessment = isAdultPatient ? patientReportGetAdultBmiAssessment(basics && basics.bmi) : null;
  const heightPercentile = heightCard && typeof heightCard.percentile === 'number' && isFinite(heightCard.percentile)
    ? heightCard.percentile
    : null;
  const hasHistory = Number(historyCount) > 0;
  const defaultTitle = 'Najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci.';
  const flaggedItems = patientReportCollectFlaggedSummaryItems(summaryLines);
  const coveredIssueGroups = new Set();
  let badge = bmiCategory || 'Ocena bieżącego pomiaru';
  let tone = bmiCard ? bmiCard.tone : 'normal';
  let title = defaultTitle;
  let text = '';
  let subtext = '';

  if (isAdultPatient && adultBmiAssessment && adultBmiAssessment.state && adultBmiAssessment.state !== 'normal') {
    coveredIssueGroups.add('body-mass');
    badge = adultBmiAssessment.badge || badge;
    tone = adultBmiAssessment.tone || tone;
    title = adultBmiAssessment.headlineTitle || title;
    text = adultBmiAssessment.headlineText || text;
    subtext = '';
  } else if (!isAdultPatient && typeof heightPercentile === 'number' && isFinite(heightPercentile) && heightPercentile <= 10) {
    coveredIssueGroups.add('growth');
    const trendSentence = hasHistory
      ? 'Szczególnie ważne jest porównanie obecnego wzrostu z wcześniejszymi pomiarami i oceną tempa wzrastania.'
      : 'Szczególnie ważna jest ocena tempa wzrastania w kolejnych pomiarach.';
    const contextSentence = 'Wynik warto interpretować także w odniesieniu do wzrostu rodziców i całego obrazu klinicznego.';
    if (heightPercentile <= 3) {
      badge = 'Niski wzrost';
      tone = 'danger';
      if (bmiKind === 'obesity' || bmiKind === 'overweight') {
        coveredIssueGroups.add('body-mass');
        title = `Wzrost znajduje się wyraźnie poniżej typowego zakresu, a ${patientReportBuildBodyMassRangeSentence(metrics, 'high', { inline: true, modifier: 'jednocześnie', rangeText: 'powyżej normy dla wieku' })}.`;
        text = '';
      } else if (bmiKind === 'underweight') {
        coveredIssueGroups.add('body-mass');
        title = `Wzrost znajduje się wyraźnie poniżej typowego zakresu, a ${patientReportBuildBodyMassRangeSentence(metrics, 'low', { inline: true, modifier: 'dodatkowo', rangeText: 'poniżej normy dla wieku' })}.`;
        text = 'Taki układ wyników wymaga szczególnie uważnej oceny wzrastania i stanu odżywienia dziecka.';
      } else {
        title = 'Wzrost znajduje się wyraźnie poniżej typowego zakresu dla wieku i płci.';
        text = '';
      }
      subtext = `${trendSentence} ${contextSentence}`;
    } else {
      badge = 'Niski wzrost';
      tone = (bmiKind === 'obesity') ? 'danger' : 'warn';
      if (bmiKind === 'obesity' || bmiKind === 'overweight') {
        coveredIssueGroups.add('body-mass');
        title = `Wzrost znajduje się w niskim zakresie centylowym, a ${patientReportBuildBodyMassRangeSentence(metrics, 'high', { inline: true, modifier: 'jednocześnie', rangeText: 'powyżej typowego zakresu' })}.`;
        text = 'W takiej sytuacji równie ważna jak ocena masy ciała jest analiza tempa wzrastania i całego przebiegu wzrostu.';
      } else if (bmiKind === 'underweight') {
        coveredIssueGroups.add('body-mass');
        title = `Wzrost znajduje się w niskim zakresie centylowym, a ${patientReportBuildBodyMassRangeSentence(metrics, 'low', { inline: true, modifier: 'dodatkowo', rangeText: 'poniżej typowego zakresu' })}.`;
        text = 'Taki wynik wymaga uważnej obserwacji tempa wzrastania i przyrostu masy ciała w czasie.';
      } else {
        title = 'Wzrost znajduje się w niskim zakresie centylowym dla wieku i płci.';
        text = '';
      }
      subtext = `${trendSentence} ${contextSentence}`;
    }
  } else if (bmiCategory.includes('Otyłość')) {
    coveredIssueGroups.add('body-mass');
    title = `${patientReportBuildBodyMassRangeSentence(metrics, 'high', { modifier: 'obecnie wyraźnie', rangeText: 'powyżej typowych wartości dla wieku' })}.`;
    text = 'Najważniejsze jest obserwowanie trendu w kolejnych pomiarach i ocenianie, czy wynik stopniowo przesuwa się w stronę bardziej typowego zakresu.';
    tone = 'danger';
  } else if (bmiCategory === 'Nadwaga') {
    coveredIssueGroups.add('body-mass');
    title = `${patientReportBuildBodyMassRangeSentence(metrics, 'high', { modifier: 'obecnie', rangeText: 'powyżej typowego zakresu dla wieku' })}.`;
    text = 'Najważniejsze jest obserwowanie trendu kolejnych pomiarów i konsekwentne trzymanie się zaleceń ustalonych podczas wizyty.';
    tone = 'warn';
  } else if (bmiCategory === 'Niedowaga') {
    coveredIssueGroups.add('body-mass');
    title = `${patientReportBuildBodyMassRangeSentence(metrics, 'low', { modifier: 'obecnie', rangeText: 'poniżej typowego zakresu dla wieku' })}.`;
    text = 'W kolejnych wizytach warto sprawdzać, czy wynik wraca w kierunku typowych wartości dla wieku i wzrostu.';
    tone = 'warn';
  }

  if (title === defaultTitle) {
    const flaggedHeadline = patientReportBuildFlaggedSummaryHeadline(summaryLines);
    if (flaggedHeadline) {
      badge = flaggedHeadline.badge || badge;
      tone = flaggedHeadline.tone || tone;
      title = flaggedHeadline.title || title;
      text = flaggedHeadline.text || text;
      subtext = flaggedHeadline.subtext || subtext;
      (flaggedHeadline.issueGroups || []).forEach((group) => {
        if (group) coveredIssueGroups.add(group);
      });
    }
  } else {
    text = patientReportAppendSentence(text, patientReportBuildAdditionalIssueSentence(flaggedItems, Array.from(coveredIssueGroups)));
  }

  if (flaggedItems.some((item) => item.tone === 'danger')) {
    tone = 'danger';
  } else if (flaggedItems.length && tone === 'normal') {
    tone = 'warn';
  }

  if (Array.isArray(highlights) && highlights.length && tone === 'normal') {
    tone = highlights.some((item) => item.tone === 'danger') ? 'danger' : 'warn';
    badge = 'Wymaga omówienia';
    if (title === defaultTitle) {
      title = 'Nie wszystkie najważniejsze wyniki mieszczą się obecnie w typowym zakresie dla wieku i płci.';
      text = 'Co najmniej jeden z parametrów z podsumowania wymaga dodatkowego omówienia.';
    }
  }

  return { badge, tone, title, text, subtext };
}

function patientReportBuildMetricCards() {
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const sex = document.getElementById('sex')?.value || 'M';
  const weight = parseFloat(document.getElementById('weight')?.value);
  const height = parseFloat(document.getElementById('height')?.value);
  const bmi = (!isNaN(weight) && !isNaN(height) && typeof BMI === 'function') ? BMI(weight, height) : null;
  const preferredSource = patientReportGetPreferredSource();
  const isAdult = patientReportIsAdultAgeForCurrentMode(ageYears);
  const isChild = ageYears > 0 && !isAdult;
  const referenceAgeYears = patientReportGetReferenceAgeYears(ageYears);
  const canUseAnthroReference = isChild && typeof referenceAgeYears === 'number' && isFinite(referenceAgeYears) && referenceAgeYears > 0 && referenceAgeYears <= PATIENT_REPORT_ADULT_REFERENCE_AGE;
  const trendPoints = patientReportCollectAllTrendPoints();
  const adultBmiAssessment = isAdult ? patientReportGetAdultBmiAssessment(bmi) : null;
  const adultBmiWeightDeltaSentence = isAdult
    ? patientReportBuildAdultBmiWeightDeltaSentence(weight, height)
    : '';
  const adultBmiSimplifiedDeltaStates = new Set(['overweight', 'obesity-1', 'obesity-2', 'obesity-3', 'underweight']);
  const adultBmiNeedsSimplifiedDelta = !!(isAdult && adultBmiAssessment && adultBmiSimplifiedDeltaStates.has(adultBmiAssessment.state));
  const adultBmiDeltaPrefersPlainNormalRange = !!(adultBmiAssessment && adultBmiAssessment.state === 'underweight');
  const adultBmiWeightDeltaSentenceForWeightCard = adultBmiNeedsSimplifiedDelta
    ? patientReportBuildAdultBmiWeightDeltaSentence(weight, height, {
        preferPlainNormalRange: adultBmiDeltaPrefersPlainNormalRange
      })
    : adultBmiWeightDeltaSentence;
  const adultBmiWeightDeltaSentenceForBmiCard = adultBmiNeedsSimplifiedDelta
    ? patientReportBuildAdultBmiWeightDeltaSentence(weight, height, {
        lowercaseStart: true,
        omitAdultQualifier: true,
        preferPlainNormalRange: adultBmiDeltaPrefersPlainNormalRange
      })
    : adultBmiWeightDeltaSentence;

  const weightResolved = (canUseAnthroReference && !isNaN(weight) && typeof advHistoryResolveMetric === 'function')
    ? advHistoryResolveMetric('WT', weight, sex, referenceAgeYears, preferredSource)
    : { result: null, source: null, reason: '' };
  const heightResolved = (canUseAnthroReference && !isNaN(height) && typeof advHistoryResolveMetric === 'function')
    ? advHistoryResolveMetric('HT', height, sex, referenceAgeYears, preferredSource)
    : { result: null, source: null, reason: '' };
  const bmiResolved = (isChild && typeof bmi === 'number' && isFinite(bmi) && typeof advHistoryResolveMetric === 'function')
    ? advHistoryResolveMetric('BMI', bmi, sex, referenceAgeYears, preferredSource)
    : { result: null, source: null, reason: '' };

  const bmiCategoryLabel = (typeof bmi === 'number' && isFinite(bmi))
    ? ((isChild && typeof bmiCategoryChild === 'function')
      ? bmiCategoryChild(bmi, sex, Math.round(ageYears * 12))
      : ((typeof window.bmiCategory === 'function')
        ? window.bmiCategory(bmi)
        : ((typeof bmiCategory === 'function') ? bmiCategory(bmi) : '')))
    : '';

  const weightPercentile = weightResolved && weightResolved.result ? weightResolved.result.percentile : null;
  const heightPercentile = heightResolved && heightResolved.result ? heightResolved.result.percentile : null;
  const bmiPercentile = bmiResolved && bmiResolved.result ? bmiResolved.result.percentile : null;

  const weightMedian = isChild ? patientReportGetMetricMedian('WT', sex, referenceAgeYears, weightResolved.source, weightResolved) : null;
  const heightMedian = isChild ? patientReportGetMetricMedian('HT', sex, referenceAgeYears, heightResolved.source, heightResolved) : null;
  const bmiMedian = isChild ? patientReportGetMetricMedian('BMI', sex, referenceAgeYears, bmiResolved.source, bmiResolved) : null;

  const adultPopulationSexLabel = isAdult ? patientReportGetAdultPopulationSexLabel(sex) : '';
  const adultHeightPosition = isAdult ? patientReportResolveAdultHeightPosition(height, sex, ageYears) : null;
  const adultHeightMedian = (adultHeightPosition && adultHeightPosition.available) ? adultHeightPosition.p50 : null;
  const adultBmiMedianRef = isAdult ? patientReportGetAdultBmiMedianRef(sex, ageYears) : null;
  const adultBmiMedian = (adultBmiMedianRef && typeof adultBmiMedianRef.medianBmi === 'number' && isFinite(adultBmiMedianRef.medianBmi))
    ? adultBmiMedianRef.medianBmi
    : null;
  const adultReferenceWeight = isAdult ? patientReportWeightForBmi(height, 22) : null;
  const adultPeerWeight = isAdult ? patientReportWeightForBmi(height, adultBmiMedian) : null;

  const adultWeightReferenceContextSentence = isAdult
    ? 'Główny box pokazuje orientacyjną „idealną” wagę przy Twoim wzroście, czyli masę ciała odpowiadającą BMI\u00A022. Drugi box pokazuje punkt odniesienia do populacji: jak Twoja masa wypada na tle osób tej samej płci i z podobnej grupy wieku w Polsce po przeliczeniu na Twój wzrost.'
    : '';
  const weightReferenceLabel = isAdult ? 'Orientacyjna prawidłowa masa przy Twoim wzroście (BMI\u00A022)' : 'Przeciętna masa dla tego wieku';
  const adultPeerWeightReferenceLabel = (isAdult && adultBmiMedianRef)
    ? 'Przeciętna masa osób Twojej płci i wieku w Polsce (przy Twoim wzroście)'
    : 'Przeciętna masa rówieśników w Polsce (przy Twoim wzroście)';
  const heightReferenceLabel = (isAdult && adultHeightPosition && adultHeightPosition.available)
    ? 'Przeciętny wzrost osób Twojej płci i wieku w Polsce'
    : 'Przeciętny wzrost dla tego wieku';
  const bmiReferenceLabel = (isAdult && adultBmiMedianRef)
    ? 'Przeciętne BMI osób Twojej płci i wieku w Polsce'
    : 'Przeciętne BMI dla tego wieku';

  const cards = [];

  if (!isNaN(weight)) {
    const series = patientReportBuildTrendSeries(trendPoints, 'WT');
    const tone = isAdult
      ? ((adultBmiAssessment && adultBmiAssessment.tone) || 'normal')
      : ((typeof weightPercentile === 'number' && isFinite(weightPercentile))
        ? ((weightPercentile <= 3 || weightPercentile >= 97)
          ? 'danger'
          : (((weightPercentile > 3 && weightPercentile < 10) || (weightPercentile >= 90 && weightPercentile < 97)) ? 'warn' : 'normal'))
        : 'normal');
    const note = isAdult
      ? patientReportAppendSentence(
          patientReportAppendSentence(
            patientReportEnsureSentence((adultBmiAssessment && adultBmiAssessment.weightNote) || 'Ocena masy ciała u dorosłych opiera się przede wszystkim na BMI.'),
            adultWeightReferenceContextSentence
          ),
          adultBmiWeightDeltaSentenceForWeightCard
        )
      : patientReportDescribeWeight(weightPercentile);

    cards.push({
      key: 'WT',
      title: 'Masa ciała',
      value: `${patientReportFormatNumber(weight, 1)} kg`,
      badge: isAdult
        ? (((adultBmiAssessment && adultBmiAssessment.badge) || bmiCategoryLabel || '—'))
        : patientReportFormatPercentile(weightPercentile),
      percentile: isAdult ? null : weightPercentile,
      tone,
      note,
      reference: isAdult
        ? patientReportBuildMedianReference('Masa', weight, adultReferenceWeight, {
            friendlyLabel: weightReferenceLabel,
            medianUnit: 'kg',
            diffUnit: 'kg',
            digits: 1,
            exactText: 'To dokładnie tyle, ile wynosi ta orientacyjna prawidłowa masa.',
            nearText: 'To prawie tyle samo, ile wynosi ta orientacyjna prawidłowa masa.',
            nearTolerance: PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.WEIGHT_KG,
            unavailableText: 'Brak porównania do masy referencyjnej.'
          })
        : patientReportBuildMedianReference('Masa', weight, weightMedian, {
            friendlyLabel: weightReferenceLabel,
            medianUnit: 'kg',
            diffUnit: 'kg',
            digits: 1
          }),
      secondaryReference: isAdult
        ? patientReportBuildMedianReference('Masa', weight, adultPeerWeight, {
            friendlyLabel: adultPeerWeightReferenceLabel,
            medianUnit: 'kg',
            diffUnit: 'kg',
            digits: 1,
            exactText: 'To dokładnie przeciętna wartość w tej grupie.',
            nearText: 'To prawie tyle samo, ile wynosi przeciętna wartość w tej grupie.',
            nearTolerance: PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.WEIGHT_KG,
            unavailableText: 'Brak porównania do mediany BMI rówieśników.'
          })
        : null,
      scale: isAdult
        ? null
        : ((typeof weightPercentile === 'number' && isFinite(weightPercentile))
          ? patientReportBuildScaleModel('WT', weightPercentile, patientReportBuildScaleValueLabels('WT', sex, referenceAgeYears, weightResolved.source))
          : null),
      hideEmptyScale: isAdult,
      sparkline: patientReportBuildSparklineSvg(series, { title: 'masa ciała', unit: 'kg', digits: 1 }),
      trendText: patientReportBuildTrendDeltaText(series, 'kg', 1)
    });
  }

  if (!isNaN(height)) {
    const series = patientReportBuildTrendSeries(trendPoints, 'HT');
    const tone = isAdult
      ? 'normal'
      : ((typeof heightPercentile === 'number' && isFinite(heightPercentile))
        ? ((heightPercentile <= 3) ? 'danger' : (((heightPercentile > 3 && heightPercentile <= 10) || heightPercentile > 97) ? 'warn' : 'normal'))
        : 'normal');
    const note = isAdult
      ? patientReportGetAdultHeightInfoNote(adultHeightPosition)
      : patientReportDescribeHeight(heightPercentile);

    cards.push({
      key: 'HT',
      title: 'Wzrost',
      value: `${patientReportFormatNumber(height, 1)} cm`,
      badge: isAdult
        ? (((adultHeightPosition && adultHeightPosition.badge) || '—'))
        : patientReportFormatPercentile(heightPercentile),
      percentile: isAdult ? null : heightPercentile,
      tone,
      note,
      reference: isAdult
        ? patientReportBuildMedianReference('Wzrost', height, adultHeightMedian, {
            friendlyLabel: heightReferenceLabel,
            medianUnit: 'cm',
            diffUnit: 'cm',
            digits: 1,
            exactText: 'To dokładnie przeciętny wzrost w tej grupie.',
            nearText: 'To prawie tyle samo, ile wynosi przeciętny wzrost w tej grupie.',
            nearTolerance: PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.HEIGHT_CM,
            unavailableText: 'Brak porównania do dorosłej populacji w Polsce.'
          })
        : patientReportBuildMedianReference('Wzrost', height, heightMedian, {
            friendlyLabel: heightReferenceLabel,
            medianUnit: 'cm',
            diffUnit: 'cm',
            digits: 1
          }),
      scale: isAdult
        ? patientReportBuildAdultHeightScaleModel(adultHeightPosition)
        : ((typeof heightPercentile === 'number' && isFinite(heightPercentile))
          ? patientReportBuildScaleModel('HT', heightPercentile, patientReportBuildScaleValueLabels('HT', sex, referenceAgeYears, heightResolved.source))
          : null),
      sparkline: patientReportBuildSparklineSvg(series, { title: 'wzrost', unit: 'cm', digits: 1 }),
      trendText: patientReportBuildTrendDeltaText(series, 'cm', 1)
    });
  }

  if (typeof bmi === 'number' && isFinite(bmi)) {
    const series = patientReportBuildTrendSeries(trendPoints, 'BMI');
    const tone = isAdult
      ? ((adultBmiAssessment && adultBmiAssessment.tone) || 'normal')
      : (bmiCategoryLabel.includes('Otyłość') ? 'danger' : ((bmiCategoryLabel === 'Nadwaga' || bmiCategoryLabel === 'Niedowaga') ? 'warn' : 'normal'));
    const note = isAdult
      ? patientReportAppendSentence(
          ((adultBmiAssessment && adultBmiAssessment.bmiNote) || patientReportDescribeBmi(bmiCategoryLabel)),
          adultBmiWeightDeltaSentenceForBmiCard
        )
      : patientReportDescribeBmi(bmiCategoryLabel);

    cards.push({
      key: 'BMI',
      title: 'BMI',
      value: patientReportFormatNumber(bmi, 1),
      badge: isAdult
        ? (((adultBmiAssessment && adultBmiAssessment.badge) || bmiCategoryLabel || patientReportFormatPercentile(bmiPercentile)))
        : (bmiCategoryLabel || patientReportFormatPercentile(bmiPercentile)),
      percentile: isAdult ? null : bmiPercentile,
      category: bmiCategoryLabel,
      tone,
      note,
      reference: isAdult
        ? patientReportBuildMedianReference('BMI', bmi, adultBmiMedian, {
            friendlyLabel: bmiReferenceLabel,
            medianUnit: '',
            diffUnit: 'pkt',
            digits: 1,
            exactText: 'To dokładnie przeciętne BMI w tej grupie.',
            nearText: 'To prawie tyle samo, ile wynosi przeciętne BMI w tej grupie.',
            nearTolerance: PATIENT_REPORT_REFERENCE_NEAR_TOLERANCE.BMI,
            unavailableText: 'Brak porównania do mediany BMI rówieśników.'
          })
        : patientReportBuildMedianReference('BMI', bmi, bmiMedian, {
            friendlyLabel: 'Przeciętne BMI dla tego wieku',
            medianUnit: '',
            diffUnit: 'pkt',
            digits: 1
          }),
      extraHtml: isAdult ? patientReportBuildAdultBmiRangesTableHtml(bmi, tone) : '',
      scale: isChild
        ? patientReportBuildScaleModel('BMI', bmiPercentile, patientReportBuildScaleValueLabels('BMI', sex, referenceAgeYears, bmiResolved.source))
        : (isAdult ? patientReportBuildAdultBmiScaleModel(bmi) : null),
      hideEmptyScale: false,
      sparkline: patientReportBuildSparklineSvg(series, { title: 'BMI', unit: '', digits: 1 }),
      trendText: patientReportBuildTrendDeltaText(series, 'pkt', 1)
    });
  }

  return {
    cards,
    historyCount: trendPoints.filter((point) => point && point.current !== true).length,
    preferredSource,
    isChild,
    isAdult,
    referenceAgeYears
  };
}

function patientReportGetCurrentBasics() {
  const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
  const sex = document.getElementById('sex')?.value || 'M';
  const weight = parseFloat(document.getElementById('weight')?.value);
  const height = parseFloat(document.getElementById('height')?.value);
  const bmi = (!isNaN(weight) && !isNaN(height) && typeof BMI === 'function') ? BMI(weight, height) : null;
  const isAdult = patientReportIsAdultAgeForCurrentMode(ageYears);
  return {
    ageYears,
    sex,
    weight,
    height,
    bmi,
    isChild: ageYears > 0 && !isAdult,
    isAdult,
    referenceAgeYears: patientReportGetReferenceAgeYears(ageYears)
  };
}

function patientReportClassifyCole(cole) {

  if (typeof cole !== 'number' || !isFinite(cole)) {
    return {
      category: 'Brak danych',
      tone: 'normal',
      note: 'Nie udało się wyliczyć wskaźnika Cole’a dla tego pomiaru.'
    };
  }
  if (cole < 90) {
    return {
      category: 'Niedowaga',
      tone: 'warn',
      note: 'Masa względem wzrostu i wieku jest obecnie poniżej typowego zakresu.'
    };
  }
  if (cole >= 120) {
    return {
      category: 'Otyłość',
      tone: 'danger',
      note: 'Wskaźnik Cole’a potwierdza wyraźny nadmiar masy ciała względem wzrostu i wieku.'
    };
  }
  if (cole > 110) {
    return {
      category: 'Nadwaga',
      tone: 'warn',
      note: 'Wskaźnik Cole’a wskazuje na masę ciała powyżej typowego zakresu dla wzrostu i wieku.'
    };
  }
  return {
    category: 'W normie',
    tone: 'normal',
    note: 'Masa względem wzrostu i wieku mieści się obecnie w typowym zakresie.'
  };
}

function patientReportBuildColeScaleModel(cole) {
  if (typeof cole !== 'number' || !isFinite(cole)) return null;
  const min = 70;
  const max = 130;
  const clamp = Math.max(min, Math.min(max, cole));
  const toPos = (value) => ((value - min) / (max - min)) * 100;
  return {
    marker: toPos(clamp),
    ticks: [
      { pos: toPos(90), label: '90%', safePos: toPos(90) },
      { pos: toPos(100), label: '100%', safePos: toPos(100) },
      { pos: toPos(110), label: '110%', safePos: toPos(110) },
      { pos: toPos(120), label: '120%', safePos: toPos(120) }
    ],
    gradient: 'linear-gradient(90deg, #ffd7d7 0%, #ffc7c7 16.666%, #ffe2b7 28.333%, #d7f2f3 33.333%, #b3eaed 50%, #d7f2f3 66.666%, #ffe2b7 71.666%, #ffc7c7 83.333%, #ffd7d7 100%)'
  };
}


function patientReportNormalizeBmiCategory(category) {
  const raw = String(category || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('niedowaga')) return 'underweight';
  if (raw.includes('prawid')) return 'normal';
  if (raw.includes('nadwaga')) return 'overweight';
  if (raw.includes('otyłość')) return 'obesity';
  return '';
}

function patientReportNormalizeColeCategory(category) {
  const raw = String(category || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('niedowaga')) return 'underweight';
  if (raw.includes('norm')) return 'normal';
  if (raw.includes('nadwaga')) return 'overweight';
  if (raw.includes('otyłość')) return 'obesity';
  return '';
}

function patientReportBuildColeBmiExplanation(bmiCategory, coleCategory) {
  const bmiRaw = String(bmiCategory || '').trim();
  const coleRaw = String(coleCategory || '').trim();
  const bmiKind = patientReportNormalizeBmiCategory(bmiRaw);
  const coleKind = patientReportNormalizeColeCategory(coleRaw);

  if (!bmiKind || !coleKind) {
    return 'Wskaźnik Cole’a porównuje BMI do przeciętnej wartości dla wieku i płci (100%), dlatego może różnić się od samej kategorii BMI.';
  }

  const explanations = {
    'underweight|underweight': 'BMI i wskaźnik Cole’a są zgodne: oba wskazują, że masa ciała względem wzrostu jest poniżej typowego zakresu dla wieku.',
    'underweight|normal': 'BMI jest już poniżej progu centylowego, a wskaźnik Cole’a jeszcze mieści się w normie. Zwykle oznacza to wynik bliski granicy, gdzie jedna metoda reaguje wcześniej niż druga.',
    'underweight|overweight': 'BMI sugeruje niedobór masy, a wskaźnik Cole’a nadmiar masy. Taki rozjazd nie jest typowy i warto jeszcze raz sprawdzić pomiary oraz interpretować wynik łącznie z lekarzem.',
    'underweight|obesity': 'BMI sugeruje niedobór masy, a wskaźnik Cole’a otyłość. Taki układ nie jest typowy i wymaga ponownego sprawdzenia danych pomiarowych oraz całościowej oceny lekarskiej.',

    'normal|underweight': 'BMI jest jeszcze w szerokim zakresie normy centylowej, ale wskaźnik Cole’a pokazuje, że masa ciała jest już bliżej dolnej granicy względem wartości przeciętnej dla wieku i płci. To sygnał do obserwacji kolejnych pomiarów.',
    'normal|normal': 'BMI i wskaźnik Cole’a są zgodne: oba pokazują, że masa ciała względem wzrostu mieści się obecnie w typowym zakresie.',
    'normal|overweight': 'BMI jest jeszcze w szerokim zakresie normy centylowej, ale wskaźnik Cole’a porównuje BMI do wartości przeciętnej dla wieku i płci. Dlatego może jako pierwszy pokazać nadwagę, gdy BMI dziecka jest już wyraźnie powyżej mediany, choć nie przekroczyło jeszcze progu nadwagi na siatkach BMI.',
    'normal|obesity': 'Klasyfikacja BMI jest jeszcze niższa, ale wskaźnik Cole’a pokazuje już bardzo duży nadmiar masy względem wartości przeciętnej dla wieku i płci. Taki wynik wymaga dokładniejszej oceny i kontroli kolejnych pomiarów.',

    'overweight|underweight': 'BMI wskazuje nadmiar masy, a wskaźnik Cole’a wynik poniżej normy. Taki rozjazd nie jest typowy i warto sprawdzić poprawność pomiarów oraz interpretację wyniku z lekarzem.',
    'overweight|normal': 'BMI wskazuje nadwagę, a wskaźnik Cole’a jest jeszcze w normie. Obie metody używają innych progów, więc przy wyniku blisko granicy BMI może przejść do kategorii nadwagi wcześniej niż Cole.',
    'overweight|overweight': 'BMI i wskaźnik Cole’a są zgodne: oba wskazują na nadmiar masy ciała względem wzrostu i wieku.',
    'overweight|obesity': 'BMI wskazuje nadwagę, a wskaźnik Cole’a już otyłość. Cole porównuje BMI bezpośrednio do przeciętnej wartości dla wieku i płci, dlatego może mocniej pokazać nasilony nadmiar masy.',

    'obesity|underweight': 'BMI wskazuje otyłość, a wskaźnik Cole’a wynik poniżej normy. Taki rozjazd nie jest typowy i wymaga ponownego sprawdzenia danych pomiarowych oraz oceny całego obrazu klinicznego.',
    'obesity|normal': 'BMI wskazuje otyłość, a wskaźnik Cole’a jest jeszcze w normie. Taki rozjazd nie jest typowy; warto zweryfikować pomiar wzrostu i masy oraz omówić wynik łącznie z lekarzem.',
    'obesity|overweight': 'Obie metody pokazują nadmiar masy, ale BMI ocenia go już jako otyłość, a wskaźnik Cole’a jeszcze jako nadwagę. Zwykle oznacza to wynik bliski granicy między tymi kategoriami.',
    'obesity|obesity': 'BMI i wskaźnik Cole’a są zgodne: oba wskazują na otyłość, czyli wyraźny nadmiar masy ciała względem wieku i wzrostu.'
  };

  let explanation = explanations[`${bmiKind}|${coleKind}`]
    || 'BMI i wskaźnik Cole’a korzystają z różnych progów odniesienia. BMI opiera się na kategoriach centylowych, a Cole porównuje wynik do wartości przeciętnej dla wieku i płci, dlatego czasem jedna metoda pokazuje wyższą kategorię wcześniej niż druga.';

  if (bmiRaw.toLowerCase().includes('olbrzym') && coleKind === 'obesity') {
    explanation = 'BMI pokazuje bardzo duży nadmiar masy ciała, a wskaźnik Cole’a również potwierdza otyłość. Oba wyniki wskazują na wyraźne przekroczenie typowego zakresu dla wieku i wzrostu.';
  } else if (bmiRaw.toLowerCase().includes('olbrzym') && coleKind === 'overweight') {
    explanation = 'BMI pokazuje bardzo duży nadmiar masy ciała, a wskaźnik Cole’a niższą kategorię. Obie metody potwierdzają nadmiar masy, ale korzystają z innych progów odniesienia.';
  }

  return explanation;
}

function patientReportBuildColeCard() {
  const basics = patientReportGetCurrentBasics();
  if (!basics.isChild || typeof basics.bmi !== 'number' || !isFinite(basics.bmi)) {
    return {
      key: 'COLE',
      title: 'Wskaźnik Cole’a',
      value: '—',
      badge: 'Brak danych',
      tone: 'normal',
      note: 'Porównanie do wskaźnika Cole’a jest dostępne po wyliczeniu BMI u dziecka.',
      explanation: '',
      reference: { available: false },
      scale: null,
      sparkline: '',
      trendText: ''
    };
  }
  const preferredSource = patientReportGetPreferredSource();
  const bmiResolved = (typeof advHistoryResolveMetric === 'function')
    ? advHistoryResolveMetric('BMI', basics.bmi, basics.sex, basics.ageYears, preferredSource)
    : { result: null, source: preferredSource };
  const bmiMedian = patientReportGetMetricMedian('BMI', basics.sex, basics.ageYears, bmiResolved.source, bmiResolved);
  if (typeof bmiMedian !== 'number' || !isFinite(bmiMedian) || bmiMedian <= 0) {
    return {
      key: 'COLE',
      title: 'Wskaźnik Cole’a',
      value: '—',
      badge: 'Brak danych',
      tone: 'normal',
      note: 'Nie udało się wyznaczyć wartości odniesienia dla wieku i płci.',
      explanation: '',
      reference: { available: false },
      scale: null,
      sparkline: '',
      trendText: ''
    };
  }
  const months = Math.round(basics.ageYears * 12);
  const bmiCategoryLabel = (typeof bmiCategoryChild === 'function')
    ? bmiCategoryChild(basics.bmi, basics.sex, months)
    : '';
  const cole = (basics.bmi / bmiMedian) * 100;
  const classification = patientReportClassifyCole(cole);
  return {
    key: 'COLE',
    title: 'Wskaźnik Cole’a',
    value: `${patientReportFormatNumber(cole, 1)}%`,
    badge: classification.category,
    tone: classification.tone,
    note: classification.note,
    explanation: patientReportBuildColeBmiExplanation(bmiCategoryLabel, classification.category),
    reference: patientReportBuildMedianReference("Wskaźnik Cole'a", cole, 100, {
      friendlyLabel: 'Wartość odniesienia',
      medianUnit: '%',
      diffUnit: 'pkt',
      digits: 1
    }),
    scale: patientReportBuildColeScaleModel(cole),
    sparkline: '',
    trendText: ''
  };
}

function patientReportBuildBmrCard() {
  return patientReportBuildNutritionCard();
}

function patientReportBuildVitalItem(options) {
  const opts = options || {};
  const digits = Number.isFinite(opts.digits) ? opts.digits : 0;
  const unit = String(opts.unit || '');
  const format = (value) => {
    const txt = patientReportFormatNumber(value, digits);
    return unit ? `${txt} ${unit}` : txt;
  };
  const resolveStatusText = (fallback, value) => {
    const source = opts[fallback];
    if (typeof source === 'function') return String(source(value, opts) || '');
    if (typeof source === 'string' && source.trim()) return source;
    return '';
  };
  if (!(typeof opts.median === 'number' && isFinite(opts.median) && typeof opts.min === 'number' && isFinite(opts.min) && typeof opts.max === 'number' && isFinite(opts.max))) {
    return {
      kind: opts.kind || '',
      label: opts.label || '',
      unavailable: true,
      message: opts.message || 'Brak danych odniesienia dla tego pomiaru.'
    };
  }
  let tone = 'normal';
  let status = '';
  let state = 'missing';
  if (typeof opts.value === 'number' && isFinite(opts.value)) {
    if (opts.value < opts.min) {
      tone = 'warn';
      state = 'low';
      status = resolveStatusText('lowStatusText', opts.value) || 'Wynik jest poniżej zakresu prawidłowego.';
    } else if (opts.value > opts.max) {
      tone = (typeof opts.highDangerThreshold === 'number' && isFinite(opts.highDangerThreshold) && opts.value >= opts.highDangerThreshold) ? 'danger' : 'warn';
      state = 'high';
      status = resolveStatusText('highStatusText', opts.value) || 'Wynik jest powyżej zakresu prawidłowego.';
    } else {
      state = 'normal';
      status = resolveStatusText('normalStatusText', opts.value) || 'Wynik mieści się w zakresie prawidłowym.';
    }
  }
  return {
    kind: opts.kind || '',
    label: opts.label || '',
    medianText: format(opts.median),
    rangeText: `${format(opts.min)} – ${format(opts.max)}`,
    valueText: (typeof opts.value === 'number' && isFinite(opts.value)) ? format(opts.value) : '',
    statusText: status,
    tone,
    state
  };
}

function patientReportBuildVitalsCard() {
  const basics = patientReportGetCurrentBasics();
  const referenceAgeYears = patientReportGetReferenceAgeYears(basics.ageYears);
  const isAdultReference = !!basics.isAdult;

  if (isAdultReference) {
    if (window.adultVitalsApi && typeof window.adultVitalsApi.buildReportCardData === 'function') {
      return window.adultVitalsApi.buildReportCardData();
    }
    return {
      title: 'Ciśnienie i tętno',
      badge: 'Informacyjnie',
      tone: 'normal',
      subtitle: 'Klasyfikacja ESC/PTK dla dorosłych',
      note: 'Nie udało się odczytać modułu pomiarów RR i tętna dla dorosłych. Pokazano kartę informacyjną.',
      items: [
        { label: 'Ciśnienie tętnicze', unavailable: true, message: 'Normy dla dorosłych będą dostępne po załadowaniu modułu.' },
        { label: 'Tętno spoczynkowe', unavailable: true, message: 'Normy dla dorosłych będą dostępne po załadowaniu modułu.' }
      ],
      hideMissingMeasurementLabels: false
    };
  }

  const sbp = parseFloat(document.getElementById('bpSystolic')?.value);
  const dbp = parseFloat(document.getElementById('bpDiastolic')?.value);
  const hr = parseFloat(document.getElementById('heartRate')?.value);
  const bpDatasetChoice = undefined;
  let bpRef = null;
  let bpEval = null;
  try {
    if (window.bpModuleApi && typeof window.bpModuleApi.getPediatricBpReference === 'function') {
      bpRef = window.bpModuleApi.getPediatricBpReference({
        ageYears: referenceAgeYears,
        sex: basics.sex,
        heightCm: basics.height,
        datasetChoice: bpDatasetChoice
      });
    }
  } catch (_) { bpRef = null; }
  try {
    if (isFinite(sbp) && isFinite(dbp) && window.bpModuleApi && typeof window.bpModuleApi.computePediatricBp === 'function') {
      bpEval = window.bpModuleApi.computePediatricBp({
        ageYears: referenceAgeYears,
        sex: basics.sex,
        heightCm: basics.height,
        sbp,
        dbp,
        datasetChoice: bpDatasetChoice
      });
    }
  } catch (_) { bpEval = null; }

  const bpReferenceMessage = 'Normy ciśnienia w tym raporcie pokazujemy dla wieku 3–18 lat po wpisaniu wzrostu.';
  const hrReferenceMessage = 'Normy tętna pokażemy po wyliczeniu wieku pacjenta.';

  const items = [];
  if (bpRef && bpRef.ok && bpRef.reference) {
    items.push(patientReportBuildVitalItem({
      kind: 'sbp',
      label: 'Ciśnienie skurczowe',
      unit: 'mm Hg',
      digits: 0,
      median: bpRef.reference.sbpP50,
      min: bpRef.reference.sbpP10,
      max: bpRef.reference.sbpP90,
      highDangerThreshold: bpRef.reference.sbpP95,
      value: isFinite(sbp) ? sbp : null,
      lowStatusText: 'Ciśnienie skurczowe jest poniżej zakresu prawidłowego.',
      highStatusText: 'Ciśnienie skurczowe jest powyżej zakresu prawidłowego.',
      normalStatusText: 'Ciśnienie skurczowe mieści się w zakresie prawidłowym.'
    }));
    items.push(patientReportBuildVitalItem({
      kind: 'dbp',
      label: 'Ciśnienie rozkurczowe',
      unit: 'mm Hg',
      digits: 0,
      median: bpRef.reference.dbpP50,
      min: bpRef.reference.dbpP10,
      max: bpRef.reference.dbpP90,
      highDangerThreshold: bpRef.reference.dbpP95,
      value: isFinite(dbp) ? dbp : null,
      lowStatusText: 'Ciśnienie rozkurczowe jest poniżej zakresu prawidłowego.',
      highStatusText: 'Ciśnienie rozkurczowe jest powyżej zakresu prawidłowego.',
      normalStatusText: 'Ciśnienie rozkurczowe mieści się w zakresie prawidłowym.'
    }));
  } else {
    items.push({ label: 'Ciśnienie skurczowe', unavailable: true, message: bpReferenceMessage });
    items.push({ label: 'Ciśnienie rozkurczowe', unavailable: true, message: bpReferenceMessage });
  }

  let hrItem = null;
  try {
    if (referenceAgeYears > 0 && referenceAgeYears <= PATIENT_REPORT_ADULT_REFERENCE_AGE && window.vitalSigns && typeof window.vitalSigns.getHrValues === 'function') {
      const hrPopulation = String(document.getElementById('hrPopulation')?.value || 'healthy');
      const hrTempValue = parseFloat(document.getElementById('hrTemperature')?.value);
      const hrOpts = { population: hrPopulation };
      if (isFinite(hrTempValue)) hrOpts.temperature = hrTempValue;
      const hrRef = window.vitalSigns.getHrValues(referenceAgeYears, hrOpts);
      if (hrRef && typeof hrRef.median === 'number' && isFinite(hrRef.median)) {
        hrItem = patientReportBuildVitalItem({
          kind: 'hr',
          label: 'Tętno',
          unit: 'ud./min',
          digits: 0,
          median: hrRef.median,
          min: hrRef.p10,
          max: hrRef.p90,
          value: isFinite(hr) ? hr : null,
          lowStatusText: 'Wynik jest poniżej zakresu prawidłowego.',
          highStatusText: 'Wynik jest powyżej zakresu prawidłowego.',
          normalStatusText: 'Wynik mieści się w zakresie prawidłowym.'
        });
      }
    }
  } catch (_) { hrItem = null; }
  if (!hrItem) {
    hrItem = { label: 'Tętno', unavailable: true, message: hrReferenceMessage };
  }
  items.push(hrItem);

  const referenceItems = items.filter((item) => item && !item.unavailable);
  const measurableItems = referenceItems.filter((item) => item.valueText);
  const anyMeasured = measurableItems.length > 0;
  const referenceOnly = referenceItems.length > 0 && !anyMeasured;
  const bpMeasuredItems = measurableItems.filter((item) => item.kind === 'sbp' || item.kind === 'dbp');
  const hrMeasuredItem = measurableItems.find((item) => item.kind === 'hr') || null;
  const bpLow = bpMeasuredItems.some((item) => item.state === 'low');
  const bpHighWarn = bpMeasuredItems.some((item) => item.state === 'high' && item.tone !== 'danger') || !!(bpEval && bpEval.ok && bpEval.severity === 'high');
  const bpHighDanger = bpMeasuredItems.some((item) => item.state === 'high' && item.tone === 'danger') || !!(bpEval && bpEval.ok && (bpEval.severity === 'stage1' || bpEval.severity === 'stage2'));
  const hrLow = !!(hrMeasuredItem && hrMeasuredItem.state === 'low');
  const hrHigh = !!(hrMeasuredItem && hrMeasuredItem.state === 'high');
  const allMeasuredNormal = anyMeasured && measurableItems.every((item) => item.state === 'normal');

  const ageReferenceBadge = 'Normy dla wieku';
  const referenceNote = 'Pokazano wartości referencyjne dla wieku.';
  const pendingReferenceNote = 'Normy dla wieku będą dostępne po uzupełnieniu danych pacjenta.';

  let tone = 'normal';
  let badge = anyMeasured ? ageReferenceBadge : 'Informacyjnie';
  let note = referenceItems.length ? referenceNote : pendingReferenceNote;

  if (bpHighDanger) {
    tone = 'danger';
    badge = 'Poza normą';
    note = hrHigh
      ? (isAdultReference
          ? 'Ciśnienie tętnicze jest powyżej przyjętych norm dla płci i wzrostu, a tętno jest powyżej zakresu prawidłowego.'
          : 'Ciśnienie tętnicze jest powyżej normy dla płci, wieku i wzrostu, a tętno jest powyżej zakresu prawidłowego.')
      : (isAdultReference
          ? 'Ciśnienie tętnicze jest powyżej przyjętych norm dla płci i wzrostu.'
          : 'Ciśnienie tętnicze jest powyżej normy dla płci, wieku i wzrostu.');
  } else if (bpHighWarn) {
    tone = 'warn';
    badge = 'Do kontroli';
    note = hrHigh
      ? (isAdultReference
          ? 'Ciśnienie tętnicze jest w górnym zakresie przyjętych norm, a tętno jest powyżej zakresu prawidłowego.'
          : 'Ciśnienie tętnicze jest w górnym zakresie, a tętno jest powyżej zakresu prawidłowego.')
      : (isAdultReference
          ? 'Ciśnienie tętnicze jest w górnym zakresie przyjętych norm i warto je skontrolować w kolejnych pomiarach.'
          : 'Ciśnienie tętnicze jest w górnym zakresie i warto je skontrolować w kolejnych pomiarach.');
  } else if (bpLow) {
    tone = 'warn';
    badge = 'Do kontroli';
    note = hrHigh
      ? (isAdultReference
          ? 'Ciśnienie tętnicze jest poniżej zakresu prawidłowego względem przyjętych norm, a tętno jest powyżej zakresu prawidłowego.'
          : 'Ciśnienie tętnicze jest poniżej zakresu prawidłowego, a tętno jest powyżej zakresu prawidłowego.')
      : (isAdultReference
          ? 'Ciśnienie tętnicze jest poniżej zakresu prawidłowego względem przyjętych norm.'
          : 'Ciśnienie tętnicze jest poniżej zakresu prawidłowego.');
  } else if (hrHigh) {
    tone = 'warn';
    badge = 'Do kontroli';
    note = isAdultReference
      ? 'Tętno jest powyżej przyjętych norm.'
      : 'Tętno jest powyżej normy dla płci, wieku i wzrostu.';
  } else if (hrLow) {
    tone = 'warn';
    badge = 'Do kontroli';
    note = isAdultReference
      ? 'Tętno jest poniżej zakresu prawidłowego względem przyjętych norm.'
      : 'Tętno jest poniżej zakresu prawidłowego.';
  } else if (allMeasuredNormal) {
    badge = 'W zakresie';
    note = isAdultReference
      ? 'Podane pomiary mieszczą się w zakresie prawidłowym względem przyjętych norm.'
      : 'Podane pomiary mieszczą się w zakresie prawidłowym.';
  } else if (anyMeasured) {
    badge = 'W zakresie';
    note = isAdultReference
      ? 'Pokazano przyjęte normy i odniesienie do podanych pomiarów.'
      : 'Pokazano wartości referencyjne dla wieku i odniesienie do podanych pomiarów.';
  }

  const subtitle = anyMeasured && tone === 'normal'
    ? (isAdultReference ? 'Normy referencyjne i odniesienie do podanych pomiarów.' : 'Normy dla wieku i odniesienie do podanych pomiarów.')
    : '';

  return {
    title: 'Ciśnienie i tętno',
    badge,
    tone,
    subtitle,
    note,
    items,
    hideMissingMeasurementLabels: referenceOnly
  };
}

function patientReportBuildBmrCardHtml(card) {
  const headers = Array.isArray(card?.tableHeaders) && card.tableHeaders.length >= 2
    ? card.tableHeaders
    : ['Składnik', 'Wartość'];
  const isNutritionNormsCard = card?.kind === 'nutrition-norms'
    || String(card?.title || '').trim().toLowerCase() === 'normy żywieniowe';
  const nutritionCardClass = isNutritionNormsCard ? ' patient-report-support-card--nutrition-norms' : '';
  const nutritionTableClass = isNutritionNormsCard ? ' patient-report-bmr-table--nutrition-norms' : '';
  const rawSubtitle = typeof card?.subtitle === 'string' ? card.subtitle.trim() : '';
  const subtitleHtml = rawSubtitle
    ? `<div class="patient-report-support-subtitle">${patientReportEscapeHtml(rawSubtitle)}</div>`
    : '';
  const noteHtml = card?.note
    ? `<div class="patient-report-support-note">${patientReportEscapeHtml(card.note || '')}</div>`
    : '';
  const rowsHtml = Array.isArray(card?.rows) && card.rows.length
    ? card.rows.map((row) => {
        const valueText = (() => {
          if (row && typeof row.valueText === 'string' && row.valueText.trim()) return row.valueText.trim();
          if (row && typeof row.value === 'number' && isFinite(row.value)) {
            return patientReportFormatNumber(row.value, Number.isFinite(row.digits) ? row.digits : 0);
          }
          return '—';
        })();
        return `
        <tr${row && row.highlighted ? ' class="is-highlighted"' : ''}>
          <td>${patientReportEscapeHtml((row && row.label) || '')}</td>
          <td>${patientReportEscapeHtml(valueText)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="2">Brak dodatkowych pozycji do pokazania.</td></tr>`;
  return `
    <article class="patient-report-support-card tone-normal${nutritionCardClass}">
      <div class="patient-report-support-top">
        <div>
          <div class="patient-report-support-title">${patientReportEscapeHtml(card?.title || 'Normy żywieniowe')}</div>
          ${subtitleHtml}
          <div class="patient-report-support-value">${patientReportEscapeHtml(card?.value || '—')}</div>
        </div>
        <div class="patient-report-metric-badge tone-normal">${patientReportEscapeHtml(card?.badge || 'Informacyjnie')}</div>
      </div>
      ${noteHtml}
      <div class="patient-report-bmr-table-wrap">
        <table class="patient-report-bmr-table${nutritionTableClass}">
          <thead>
            <tr>
              <th>${patientReportEscapeHtml(headers[0] || 'Składnik')}</th>
              <th>${patientReportEscapeHtml(headers[1] || 'Wartość')}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </article>`;
}

function patientReportBuildVitalsCardHtml(card) {
  const hideMissingMeasurementLabels = !!card?.hideMissingMeasurementLabels;
  const rawSubtitle = typeof card?.subtitle === 'string' ? card.subtitle.trim() : '';
  const rawBadge = typeof card?.badge === 'string' ? card.badge.trim() : '';
  const rawNote = typeof card?.note === 'string' ? card.note.trim() : '';
  const showSubtitle = !!rawSubtitle && rawSubtitle.toLowerCase() !== rawBadge.toLowerCase();
  const subtitleHtml = showSubtitle
    ? `<div class="patient-report-support-subtitle">${patientReportEscapeHtml(rawSubtitle)}</div>`
    : '';
  const noteHtml = rawNote
    ? `<div class="patient-report-support-note">${patientReportEscapeHtml(rawNote)}</div>`
    : '';
  const itemsHtml = (card?.items || []).map((item) => {
    if (item.unavailable) {
      return `
        <div class="patient-report-vital-item is-unavailable">
          <div class="patient-report-vital-item-title">${patientReportEscapeHtml(item.label || '')}</div>
          <div class="patient-report-vital-empty">${patientReportEscapeHtml(item.message || 'Brak danych odniesienia.')}</div>
        </div>`;
    }
    const valueFirst = !!(card?.valueFirst || item?.valueFirst);
    const valueRowHtml = item.valueText
      ? `<div class="patient-report-vital-row is-value tone-${patientReportEscapeHtml(item.tone || 'normal')}"><span class="patient-report-vital-label">Wynik pacjenta</span><strong>${patientReportEscapeHtml(item.valueText || '')}</strong></div>`
      : '';
    const statusHtml = item.statusText
      ? `<div class="patient-report-vital-status tone-${patientReportEscapeHtml(item.tone || 'normal')}">${patientReportEscapeHtml(item.statusText || '')}</div>`
      : (hideMissingMeasurementLabels ? '' : '<div class="patient-report-vital-status tone-normal">Brak wpisanego pomiaru.</div>');
    const referenceRows = Array.isArray(item.referenceRows) && item.referenceRows.length
      ? item.referenceRows
      : [
          { label: '50 centyl', value: item.medianText || '—' },
          { label: 'Zakres prawidłowy', value: item.rangeText || '—' }
        ];
    const referenceRowsHtml = referenceRows.map((row) => `
        <div class="patient-report-vital-row${row && row.highlighted ? ' is-highlighted' : ''}"><span>${patientReportEscapeHtml((row && row.label) || '')}</span><strong>${patientReportEscapeHtml((row && row.value) || '—')}</strong></div>`).join('');
    const contentHtml = valueFirst
      ? `${valueRowHtml}${statusHtml}${referenceRowsHtml}`
      : `${referenceRowsHtml}${valueRowHtml}${statusHtml}`;
    return `
      <div class="patient-report-vital-item tone-${patientReportEscapeHtml(item.tone || 'normal')}${valueFirst ? ' is-value-first' : ''}">
        <div class="patient-report-vital-item-title">${patientReportEscapeHtml(item.label || '')}</div>
        ${contentHtml}
      </div>`;
  }).join('');
  return `
    <article class="patient-report-support-card tone-${patientReportEscapeHtml(card?.tone || 'normal')}">
      <div class="patient-report-support-top">
        <div>
          <div class="patient-report-support-title">${patientReportEscapeHtml(card?.title || 'Ciśnienie i tętno')}</div>
          ${subtitleHtml}
        </div>
        <div class="patient-report-metric-badge tone-${patientReportEscapeHtml(card?.tone || 'normal')}">${patientReportEscapeHtml(card?.badge || 'Informacyjnie')}</div>
      </div>
      ${noteHtml}
      <div class="patient-report-vital-list">${itemsHtml}</div>
    </article>`;
}

function patientReportBuildSecondaryCardsHtml(model) {
  const out = [];
  const isAdult = !!(model && model.isAdult);
  if (!isAdult) {
    out.push(patientReportBuildMetricCardsHtml([model.coleCard || patientReportBuildColeCard()]));
  }
  out.push(patientReportBuildBmrCardHtml(model.nutritionCard || model.bmrCard || patientReportBuildNutritionCard()));
  out.push(patientReportBuildVitalsCardHtml(model.vitalsCard || patientReportBuildVitalsCard()));
  return out.join('');
}

function patientReportBuildModel() {
  return patientReportRunWithMode('pdf', () => {
    const name = (document.getElementById('name')?.value || document.getElementById('advName')?.value || '').trim();
    const sex = document.getElementById('sex')?.value || 'M';
    const ageYears = (typeof getAgeDecimal === 'function') ? getAgeDecimal() : 0;
    const isAdult = patientReportIsAdultAgeForCurrentMode(ageYears);
    const sourceKey = patientReportGetPreferredSource();
    const rawSourceLabel = (typeof advHistorySourceLabel === 'function') ? advHistorySourceLabel(sourceKey) : String(sourceKey || '');
    const sourceLabel = isAdult
      ? 'Normy żywienia dla populacji Polski, NIZP PZH – PIB, 2024. Krajowe badanie sposobu żywienia i stanu odżywienia populacji polskiej, NIZP PZH – PIB, 2021.'
      : rawSourceLabel;
    const sourceLines = isAdult
      ? [
          '1. Normy żywienia dla populacji Polski, NIZP PZH – PIB, 2024.',
          '2. Krajowe badanie sposobu żywienia i stanu odżywienia populacji polskiej, NIZP PZH – PIB, 2021.'
        ]
      : [];
    const sourceLabelPrefix = isAdult ? 'Główne źródła danych' : 'Porównania centylowe';
    const metricBundle = patientReportBuildMetricCards();
    let summaryLines = getFormattedProfessionalSummaryLines();
    if (isAdult) {
      summaryLines = (summaryLines || []).filter((line) => !/^\s*wskaźnik\s*cole/i.test(String(line || '').replace(/ /g, ' ')));
    }
    let highlights = patientReportCollectHighlights(summaryLines);
    let headline = patientReportBuildHeadline(metricBundle.cards, metricBundle.historyCount, highlights, summaryLines);
    if (isAdult) {
      highlights = patientReportAdaptHighlightsForAdultReference(highlights);
      headline = patientReportAdaptHeadlineForAdultReference(headline);
    }
    let generatedLabel = '';
    try {
      generatedLabel = new Intl.DateTimeFormat('pl-PL', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(new Date());
    } catch (_) {
      generatedLabel = String(new Date());
    }
    const nutritionCard = patientReportBuildNutritionCard();
    return {
      title: 'Raport po wizycie',
      subtitle: '',
      name,
      sexLabel: patientReportGetSexLabel(sex, ageYears),
      ageLabel: patientReportFormatAge(ageYears),
      generatedLabel,
      sourceLabel,
      sourceLabelPrefix,
      sourceLines,
      metricCards: metricBundle.cards,
      historyCount: metricBundle.historyCount,
      isChild: metricBundle.isChild,
      isAdult,
      showColeCard: !isAdult,
      secondaryCardCount: isAdult ? 2 : 3,
      summaryLines,
      highlights,
      headline,
      coleCard: patientReportBuildColeCard(),
      nutritionCard,
      bmrCard: nutritionCard,
      vitalsCard: patientReportBuildVitalsCard()
    };
  });
}

function patientReportBuildScaleHtml(scale, tone, options) {
  const suppressEmpty = !!(options && options.suppressEmpty);
  if (!scale) return suppressEmpty ? '' : '<div class="patient-report-scale-empty">Porównanie centylowe niedostępne dla tego wyniku.</div>';
  const valueLabelsHtml = (scale.valueLabels || []).map((item) => {
    const labelPos = (typeof item.safePos === 'number' && isFinite(item.safePos))
      ? item.safePos
      : ((typeof item.pos === 'number' && isFinite(item.pos)) ? item.pos : 0);
    return `<span class="patient-report-scale-value-label" style="left:${labelPos}%">${patientReportEscapeHtml(item.label || '')}</span>`;
  }).join('');
  const ticksHtml = (scale.ticks || []).map((tick) => {
    const labelPos = (typeof tick.safePos === 'number' && isFinite(tick.safePos)) ? tick.safePos : tick.pos;
    return `
      <span class="patient-report-scale-tick-line" style="left:${tick.pos}%;"></span>
      <span class="patient-report-scale-tick-label" style="left:${labelPos}%;">${patientReportEscapeHtml(tick.label)}</span>`;
  }).join('');
  return `
    <div class="patient-report-scale">
      ${valueLabelsHtml}
      <span class="patient-report-scale-track" style="background:${scale.gradient};"></span>
      ${ticksHtml}
      <span class="patient-report-scale-marker tone-${patientReportEscapeHtml(tone || 'normal')}" style="left:${scale.marker}%;"></span>
    </div>`;
}

function patientReportBuildReferenceHtml(reference, tone) {
  const boxTone = patientReportEscapeHtml(tone || 'normal');
  const emptyMessage = patientReportEscapeHtml((reference && (reference.emptyMessage || reference.medianText)) || 'Brak porównania do typowej wartości dla wieku.');
  if (!reference || reference.available === false) {
    return `
      <div class="patient-report-metric-reference-box tone-${boxTone} is-empty">
        <div class="patient-report-metric-reference-empty">${emptyMessage}</div>
      </div>`;
  }
  return `
    <div class="patient-report-metric-reference-box tone-${boxTone}${reference.neutral ? ' is-neutral' : ''}">
      <div class="patient-report-metric-reference-kicker">${patientReportEscapeHtml(reference.label || '')}</div>
      <div class="patient-report-metric-reference-main">${patientReportEscapeHtml(reference.medianText || '')}</div>
      <div class="patient-report-metric-reference-diff">${patientReportEscapeHtml(reference.diffText || '')}</div>
    </div>`;
}

function patientReportBuildHighlightsHtml(highlights) {
  if (!Array.isArray(highlights) || !highlights.length) {
    return '<div class="patient-report-muted-box">Brak dodatkowych ostrzeżeń do wyróżnienia na pierwszej stronie.</div>';
  }
  return `<div class="patient-report-highlight-list">${highlights.map((item) => `<div class="patient-report-highlight tone-${patientReportEscapeHtml(item.tone || 'warn')}">${patientReportEscapeHtml(item.text)}</div>`).join('')}</div>`;
}

function patientReportBuildMetricCardsHtml(cards) {
  return (cards || []).map((card) => {
    const trendCaptionHtml = (card.trendText && String(card.trendText).trim())
      ? `<div class="patient-report-metric-trend-caption">${patientReportEscapeHtml(card.trendText || '')}</div>`
      : '';
    const trendHtml = card.sparkline
      ? `${trendCaptionHtml}<div class="patient-report-trend-svg">${card.sparkline}</div>`
      : '';
    const explanationHtml = (card.explanation && String(card.explanation).trim())
      ? `
        <div class="patient-report-metric-context tone-${patientReportEscapeHtml(card.tone || 'normal')}">
          <div class="patient-report-metric-context-title">Jak to rozumieć względem BMI?</div>
          <div class="patient-report-metric-context-text">${patientReportEscapeHtml(card.explanation || '')}</div>
        </div>`
      : '';
    const referenceHtml = card.hideReference ? '' : [
      patientReportBuildReferenceHtml(card.reference, card.referenceTone || card.tone),
      card.secondaryReference ? patientReportBuildReferenceHtml(card.secondaryReference, card.secondaryReferenceTone || card.tone) : ''
    ].join('');
    const extraHtml = (card.extraHtml && String(card.extraHtml).trim()) ? String(card.extraHtml) : '';
    return `
      <article class="patient-report-metric-card tone-${patientReportEscapeHtml(card.tone || 'normal')}">
        <div class="patient-report-metric-top">
          <div>
            <div class="patient-report-metric-title">${patientReportEscapeHtml(card.title)}</div>
            <div class="patient-report-metric-value">${patientReportEscapeHtml(card.value)}</div>
          </div>
          <div class="patient-report-metric-badge tone-${patientReportEscapeHtml(card.tone || 'normal')}">${patientReportEscapeHtml(card.badge || '—')}</div>
        </div>
        <div class="patient-report-metric-note">${patientReportEscapeHtml(card.note || '')}</div>
        ${patientReportBuildScaleHtml(card.scale, card.tone, { suppressEmpty: !!card.hideEmptyScale })}
        ${extraHtml}
        ${referenceHtml}
        ${explanationHtml}
        ${trendHtml}
      </article>`;
  }).join('');
}


function patientReportBuildSafeTitleHtml(value) {
  const title = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!title) return '';

  const shortWords = new Set(['a', 'i', 'o', 'u', 'w', 'z', 'na', 'do', 'od', 'po', 'za', 'we', 'ze', 'ku']);
  const words = title.split(' ').filter(Boolean);
  const groups = [];

  for (let i = 0; i < words.length; i += 1) {
    const current = words[i];
    const currentKey = String(current || '').toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
    if (currentKey && shortWords.has(currentKey) && i + 1 < words.length) {
      groups.push(`${patientReportEscapeHtml(current)}&nbsp;${patientReportEscapeHtml(words[i + 1])}`);
      i += 1;
      continue;
    }
    groups.push(patientReportEscapeHtml(current));
  }

  return groups.map((group) => `<span class="patient-report-title-group">${group}</span>`).join(' ');
}

function patientReportBuildMetaHtml(model) {
  const buildItem = (text, className) => {
    if (!text) return '';
    const safeClass = className ? ` patient-report-meta-chip-${className}` : '';
    return `<span class="patient-report-meta-chip${safeClass}">${patientReportEscapeHtml(text)}</span>`;
  };

  const firstRow = [];
  const secondRow = [];

  if (model.name) {
    firstRow.push(buildItem(`Pacjent: ${model.name}`, 'name'));
    firstRow.push(buildItem(`Wiek: ${model.ageLabel}`, 'age'));
    secondRow.push(buildItem(`Płeć: ${model.sexLabel}`, 'sex'));
    secondRow.push(buildItem(model.generatedLabel, 'generated'));
  } else {
    firstRow.push(buildItem(`Płeć: ${model.sexLabel}`, 'sex'));
    firstRow.push(buildItem(`Wiek: ${model.ageLabel}`, 'age'));
    secondRow.push(buildItem(model.generatedLabel, 'generated'));
  }

  return [firstRow, secondRow]
    .filter((row) => row.some(Boolean))
    .map((row, index) => `<div class="patient-report-meta-row patient-report-meta-row-${index + 1}">${row.join('')}</div>`)
    .join('');
}

function patientReportBuildHtml(model) {
  const metaHtml = patientReportBuildMetaHtml(model);
  const cardsHtml = patientReportBuildMetricCardsHtml(model.metricCards);
  const secondaryCardsHtml = patientReportBuildSecondaryCardsHtml(model);
  const isAdult = !!(model && model.isAdult);
  const footerSourceHtml = isAdult
    ? ((Array.isArray(model && model.sourceLines) && model.sourceLines.length)
      ? `
          <div class="patient-report-footer-source">
            <div class="patient-report-footer-source-title">${patientReportEscapeHtml(model.sourceLabelPrefix || 'Główne źródła danych')}</div>
            <div class="patient-report-footer-source-list">
              ${model.sourceLines.map((line) => `<div class="patient-report-footer-source-line">${patientReportEscapeHtml(line || '')}</div>`).join('')}
            </div>
          </div>`
      : `
          <div class="patient-report-footer-source">
            <div class="patient-report-footer-source-title">${patientReportEscapeHtml(model.sourceLabelPrefix || 'Główne źródła danych')}</div>
            <div class="patient-report-footer-source-list">
              <div class="patient-report-footer-source-line">${patientReportEscapeHtml(model.sourceLabel || '—')}</div>
            </div>
          </div>`)
    : `
          <div class="patient-report-footer-source patient-report-footer-source-compact">
            <span class="patient-report-footer-source-title">${patientReportEscapeHtml(model.sourceLabelPrefix || 'Porównania centylowe')}:</span>
            <span class="patient-report-footer-source-inline">${patientReportEscapeHtml(model.sourceLabel || '—')}</span>
          </div>`;
  return `
    <div class="patient-report-pdf-root">
      <style>
        .patient-report-pdf-root {
          width: 1240px;
          background: #f3f9f9;
          color: #183132;
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          -webkit-text-size-adjust: none;
          text-size-adjust: none;
        }
        .patient-report-page {
          width: 1240px;
          min-height: 1754px;
          background: linear-gradient(180deg, #f7fbfb 0%, #ffffff 22%, #ffffff 100%);
          padding: 56px 58px 54px;
          box-sizing: border-box;
          position: relative;
        }
        .patient-report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }
        .patient-report-brand {
          flex: 1 1 auto;
          min-width: 0;
          max-width: none;
        }
        .patient-report-brand-kicker {
          display: block;
          padding: 0;
          border-radius: 0;
          background: none;
          color: #006a73;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: 0;
          line-height: 1.08;
          white-space: nowrap;
          font-variant-ligatures: none;
          font-feature-settings: 'liga' 0, 'kern' 1;
        }
        .patient-report-title {
          margin: 16px 0 0;
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          column-gap: 0.22em;
          row-gap: 0.08em;
          max-width: 100%;
          font-size: 42px;
          line-height: 1.08;
          font-weight: 800;
          color: #10292a;
          word-break: keep-all;
          overflow-wrap: normal;
          hyphens: none;
        }
        .patient-report-title-group {
          display: block;
          white-space: nowrap;
        }
        .patient-report-subtitle {
          margin: 12px 0 0;
          font-size: 21px;
          line-height: 1.4;
          color: #496364;
          max-width: 760px;
        }
        .patient-report-meta {
          flex: 0 1 auto;
          width: fit-content;
          max-width: 52%;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
          align-items: flex-end;
        }
        .patient-report-meta-row {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          align-items: stretch;
          width: fit-content;
          max-width: 100%;
          min-width: 0;
          margin-left: auto;
        }
        .patient-report-meta-chip {
          width: fit-content;
          max-width: 100%;
          min-width: 0;
          padding: 10px 15px;
          border-radius: 14px;
          background: #ffffff;
          border: 1px solid #d7e6e6;
          font-size: 17px;
          font-weight: 600;
          line-height: 1.28;
          color: #324b4c;
          box-sizing: border-box;
          white-space: nowrap;
        }
        .patient-report-meta-chip-age,
        .patient-report-meta-chip-sex,
        .patient-report-meta-chip-generated {
          flex: 0 0 auto;
        }
        .patient-report-meta-chip-name {
          flex: 0 1 auto;
          width: auto;
          max-width: 100%;
          text-align: left;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .patient-report-hero {
          margin-top: 28px;
          border-radius: 28px;
          background: linear-gradient(135deg, #0f7d86 0%, #14939c 100%);
          color: white;
          padding: 26px 30px 24px;
          box-shadow: 0 22px 48px rgba(0, 131, 141, 0.18);
        }
        .patient-report-hero h2 {
          margin: 0;
          font-size: 34px;
          line-height: 1.16;
          font-weight: 800;
        }
        .patient-report-hero p {
          margin: 14px 0 0;
          font-size: 20px;
          line-height: 1.46;
          max-width: 1000px;
        }
        .patient-report-grid-3 {
          margin-top: 22px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        .patient-report-secondary-grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
          align-items: stretch;
        }
        .patient-report-secondary-grid.is-two-col {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .patient-report-metric-card,
        .patient-report-detail-group,
        .patient-report-info-box,
        .patient-report-muted-box {
          background: #ffffff;
          border-radius: 24px;
          border: 1px solid #dbe8e8;
          box-shadow: 0 12px 30px rgba(15, 77, 84, 0.08);
        }
        .patient-report-metric-card {
          padding: 20px 18px 16px;
          border-width: 3px;
          border-color: #cfe3e4;
          box-shadow: 0 14px 34px rgba(15, 77, 84, 0.10);
        }
        .patient-report-metric-card.tone-danger { border-color: rgba(198, 40, 40, 0.44); }
        .patient-report-metric-card.tone-warn { border-color: rgba(199, 93, 0, 0.42); }
        .patient-report-metric-top {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }
        .patient-report-metric-title {
          font-size: 20px;
          line-height: 1.2;
          color: #1d5053;
          font-weight: 800;
        }
        .patient-report-metric-value {
          margin-top: 8px;
          font-size: 38px;
          line-height: 1;
          font-weight: 800;
          color: #102a2b;
        }
        .patient-report-metric-badge {
          flex: 0 0 auto;
          max-width: 44%;
          padding: 7px 11px;
          border-radius: 14px;
          font-size: 15px;
          font-weight: 700;
          text-align: right;
          background: rgba(0, 131, 141, 0.10);
          color: #006a73;
        }
        .patient-report-metric-badge.tone-warn { background: rgba(199, 93, 0, 0.12); color: #9a4a00; }
        .patient-report-metric-badge.tone-danger { background: rgba(198, 40, 40, 0.12); color: #a32020; }
        .patient-report-metric-note {
          margin-top: 8px;
          font-size: 18px;
          line-height: 1.38;
          color: #335152;
          min-height: 46px;
        }
        .patient-report-scale {
          position: relative;
          height: 82px;
          margin-top: 16px;
        }
        .patient-report-scale-value-label {
          position: absolute;
          top: 5px;
          transform: translateX(-50%);
          font-size: 13px;
          line-height: 1.2;
          font-weight: 700;
          color: #51696a;
          white-space: nowrap;
          z-index: 4;
          pointer-events: none;
        }
        .patient-report-scale-track {
          position: absolute;
          left: 0;
          right: 0;
          top: 22px;
          height: 30px;
          border-radius: 999px;
          overflow: hidden;
          border: 1.6px solid #c4dcde;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
        }
        .patient-report-scale-empty {
          margin-top: 18px;
          padding: 10px 12px;
          border-radius: 16px;
          background: #f5fbfb;
          font-size: 16px;
          color: #5a7071;
        }
        .patient-report-scale-tick-line {
          position: absolute;
          top: 28px;
          transform: translateX(-50%);
          width: 2px;
          height: 18px;
          background: rgba(16, 41, 42, 0.30);
          z-index: 2;
        }
        .patient-report-scale-tick-label {
          position: absolute;
          top: 58px;
          transform: translateX(-50%);
          font-size: 13px;
          font-weight: 700;
          color: #51696a;
          background: rgba(255,255,255,0.92);
          padding: 1px 6px;
          border-radius: 999px;
          white-space: nowrap;
          z-index: 2;
        }
        .patient-report-scale-marker {
          position: absolute;
          top: 37px;
          transform: translate(-50%, -50%);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #00838d;
          border: 4px solid white;
          box-shadow: 0 4px 16px rgba(0,0,0,0.18);
          z-index: 3;
        }
        .patient-report-scale-marker.tone-warn { background: #c75d00; }
        .patient-report-scale-marker.tone-danger { background: #c62828; }
        .patient-report-bmi-ranges-box {
          margin-top: 12px;
          border-radius: 18px;
          overflow: hidden;
          background: #f8fbfb;
          border: 1px solid #dbe7e7;
        }
        .patient-report-bmi-ranges-title {
          padding: 10px 12px 8px;
          font-size: 15px;
          line-height: 1.2;
          font-weight: 800;
          color: #2f666a;
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.08) 0%, rgba(0, 131, 141, 0.03) 100%);
          border-bottom: 1px solid #e2eded;
        }
        .patient-report-bmi-ranges-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .patient-report-bmi-ranges-row td {
          padding: 7px 10px;
          font-size: 14px;
          line-height: 1.28;
          color: #355253;
          border-top: 1px solid #e7efef;
        }
        .patient-report-bmi-ranges-row:first-child td {
          border-top: none;
        }
        .patient-report-bmi-ranges-value {
          text-align: right;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          color: #1e4447;
          font-weight: 700;
        }
        .patient-report-bmi-ranges-row.is-active td {
          font-weight: 800;
          background: rgba(0, 131, 141, 0.08);
        }
        .patient-report-bmi-ranges-row.is-active.tone-warn td {
          background: rgba(199, 93, 0, 0.10);
        }
        .patient-report-bmi-ranges-row.is-active.tone-danger td {
          background: rgba(198, 40, 40, 0.10);
        }
        .patient-report-metric-reference-box {
          margin-top: 12px;
          padding: 12px 14px 11px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.08) 0%, rgba(0, 131, 141, 0.04) 100%);
          border: 1.6px solid rgba(0, 131, 141, 0.18);
          min-height: 70px;
          text-align: center;
        }
        .patient-report-metric-reference-box.tone-warn {
          background: linear-gradient(180deg, rgba(199, 93, 0, 0.10) 0%, rgba(199, 93, 0, 0.05) 100%);
          border-color: rgba(199, 93, 0, 0.22);
        }
        .patient-report-metric-reference-box.tone-danger {
          background: linear-gradient(180deg, rgba(198, 40, 40, 0.10) 0%, rgba(198, 40, 40, 0.05) 100%);
          border-color: rgba(198, 40, 40, 0.22);
        }
        .patient-report-metric-reference-box.is-neutral {
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.06) 0%, rgba(0, 131, 141, 0.03) 100%);
        }
        .patient-report-metric-reference-kicker {
          font-size: 16px;
          line-height: 1.25;
          font-weight: 800;
          letter-spacing: 0;
          text-transform: none;
          color: #2f666a;
        }
        .patient-report-metric-reference-main {
          margin-top: 6px;
          font-size: 24px;
          line-height: 1.08;
          font-weight: 800;
          color: #0f2b2d;
        }
        .patient-report-metric-reference-diff {
          margin-top: 6px;
          font-size: 17px;
          line-height: 1.35;
          font-weight: 700;
          color: #2e5053;
        }
        .patient-report-metric-reference-empty {
          font-size: 16px;
          line-height: 1.45;
          color: #4a6263;
        }
        .patient-report-metric-context {
          margin-top: 10px;
          padding: 11px 13px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.07) 0%, rgba(0, 131, 141, 0.03) 100%);
          border: 1.5px solid rgba(0, 131, 141, 0.16);
        }
        .patient-report-metric-context.tone-warn {
          background: linear-gradient(180deg, rgba(199, 93, 0, 0.09) 0%, rgba(199, 93, 0, 0.04) 100%);
          border-color: rgba(199, 93, 0, 0.18);
        }
        .patient-report-metric-context.tone-danger {
          background: linear-gradient(180deg, rgba(198, 40, 40, 0.09) 0%, rgba(198, 40, 40, 0.04) 100%);
          border-color: rgba(198, 40, 40, 0.18);
        }
        .patient-report-metric-context-title {
          font-size: 15px;
          line-height: 1.25;
          font-weight: 800;
          color: #2f666a;
        }
        .patient-report-metric-context-text {
          margin-top: 6px;
          font-size: 16px;
          line-height: 1.42;
          color: #355253;
        }
        .patient-report-metric-trend-caption {
          margin-top: 10px;
          font-size: 16px;
          color: #5a7071;
          min-height: 24px;
          text-align: center;
        }
        .patient-report-trend-svg {
          margin-top: 5px;
          border-radius: 18px;
          background: #f7fbfb;
          border: 1px solid #e0ecec;
          padding: 7px;
        }
        .patient-report-support-card {
          background: #ffffff;
          border-radius: 24px;
          border: 3px solid #cfe3e4;
          box-shadow: 0 14px 34px rgba(15, 77, 84, 0.10);
          padding: 18px 17px 16px;
          min-height: 100%;
        }
        .patient-report-support-card.tone-warn { border-color: rgba(199, 93, 0, 0.42); }
        .patient-report-support-card.tone-danger { border-color: rgba(198, 40, 40, 0.44); }
        .patient-report-support-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .patient-report-support-title {
          font-size: 19px;
          line-height: 1.2;
          color: #1d5053;
          font-weight: 800;
        }
        .patient-report-support-subtitle {
          margin-top: 8px;
          font-size: 16px;
          line-height: 1.35;
          color: #5a7071;
        }
        .patient-report-support-value {
          margin-top: 8px;
          font-size: 33px;
          line-height: 1.05;
          font-weight: 800;
          color: #102a2b;
        }
        .patient-report-support-note {
          margin-top: 8px;
          font-size: 16px;
          line-height: 1.42;
          color: #345153;
          min-height: 44px;
        }
        .patient-report-bmr-table-wrap {
          margin-top: 10px;
          border-radius: 18px;
          border: 1px solid #d9e8e8;
          overflow: hidden;
          background: #fbfefe;
        }
        .patient-report-bmr-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 15px;
          line-height: 1.35;
        }
        .patient-report-bmr-table th,
        .patient-report-bmr-table td {
          padding: 8px 9px;
          text-align: left;
          vertical-align: top;
          border-bottom: 1px solid #e6f0f0;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .patient-report-bmr-table th:first-child,
        .patient-report-bmr-table td:first-child {
          width: 31%;
        }
        .patient-report-bmr-table th:last-child,
        .patient-report-bmr-table td:last-child {
          text-align: left;
          white-space: normal;
          width: 69%;
        }
        .patient-report-bmr-table--nutrition-norms {
          font-size: 14px;
        }
        .patient-report-bmr-table--nutrition-norms th,
        .patient-report-bmr-table--nutrition-norms td {
          padding-left: 7px;
          padding-right: 7px;
        }
        .patient-report-bmr-table--nutrition-norms th:first-child,
        .patient-report-bmr-table--nutrition-norms td:first-child {
          width: 42%;
          white-space: nowrap;
          overflow-wrap: normal;
          word-break: normal;
          hyphens: none;
          letter-spacing: -0.01em;
        }
        .patient-report-bmr-table--nutrition-norms th:last-child,
        .patient-report-bmr-table--nutrition-norms td:last-child {
          width: 58%;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .patient-report-bmr-table thead th {
          background: #f4fbfb;
          color: #315153;
          font-size: 14px;
          font-weight: 800;
        }
        .patient-report-bmr-table tbody tr.is-highlighted td {
          position: relative;
          background: linear-gradient(180deg, rgba(0, 131, 141, 0.10) 0%, rgba(0, 131, 141, 0.05) 100%);
          font-weight: 800;
          color: #0f4f53;
        }
        .patient-report-bmr-table tbody tr.is-highlighted td::before {
          content: '';
          position: absolute;
          inset: 0;
          border-top: 2px solid rgba(0, 131, 141, 0.22);
          border-bottom: 2px solid rgba(0, 131, 141, 0.22);
          pointer-events: none;
        }
        .patient-report-bmr-table tbody tr.is-highlighted td:first-child::before {
          border-left: 2px solid rgba(0, 131, 141, 0.22);
        }
        .patient-report-bmr-table tbody tr.is-highlighted td:last-child::before {
          border-right: 2px solid rgba(0, 131, 141, 0.22);
        }
        .patient-report-bmr-table tbody tr:last-child td {
          border-bottom: none;
        }
        .patient-report-vital-list {
          margin-top: 10px;
          display: grid;
          gap: 10px;
        }
        .patient-report-vital-item {
          border-radius: 18px;
          border: 1.5px solid #d9e8e8;
          background: #fbfefe;
          padding: 11px 11px 10px;
        }
        .patient-report-vital-item.tone-warn { border-color: rgba(199, 93, 0, 0.24); background: rgba(199, 93, 0, 0.05); }
        .patient-report-vital-item.tone-danger { border-color: rgba(198, 40, 40, 0.25); background: rgba(198, 40, 40, 0.05); }
        .patient-report-vital-item-title {
          font-size: 16px;
          line-height: 1.25;
          font-weight: 800;
          color: #183c3f;
        }
        .patient-report-vital-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          margin-top: 7px;
          font-size: 14.5px;
          line-height: 1.3;
          color: #4a6465;
        }
        .patient-report-vital-row strong {
          font-size: 16px;
          line-height: 1.2;
          color: #103132;
          text-align: right;
        }
        .patient-report-vital-row.is-value {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #dceaea;
        }
        .patient-report-vital-row.is-value .patient-report-vital-label {
          font-weight: 800;
          color: #103132;
        }
        .patient-report-vital-row.is-value strong { font-size: 16px; }
        .patient-report-vital-item.is-value-first .patient-report-vital-row.is-value {
          margin-top: 9px;
          padding: 10px 12px;
          border-top: 0;
          border-radius: 13px;
          background: rgba(0, 131, 141, 0.10);
          border: 1px solid rgba(0, 131, 141, 0.16);
        }
        .patient-report-vital-item.is-value-first.tone-warn .patient-report-vital-row.is-value {
          background: rgba(199, 93, 0, 0.11);
          border-color: rgba(199, 93, 0, 0.22);
        }
        .patient-report-vital-item.is-value-first.tone-danger .patient-report-vital-row.is-value {
          background: rgba(198, 40, 40, 0.10);
          border-color: rgba(198, 40, 40, 0.20);
        }
        .patient-report-vital-item.is-value-first .patient-report-vital-row.is-value strong {
          font-size: 18px;
          font-weight: 900;
        }
        .patient-report-vital-item.is-value-first .patient-report-vital-status {
          margin-top: 8px;
          padding: 8px 10px;
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.72);
          font-weight: 700;
        }
        .patient-report-vital-row.is-highlighted {
          padding: 7px 10px;
          border-radius: 11px;
          background: rgba(0, 131, 141, 0.08);
          color: #0f4043;
        }
        .patient-report-vital-row.is-highlighted strong { color: #0b3f43; }
        .patient-report-vital-status {
          margin-top: 7px;
          font-size: 14.5px;
          line-height: 1.4;
          color: #486263;
        }
        .patient-report-vital-status.tone-warn { color: #9a4a00; }
        .patient-report-vital-status.tone-danger { color: #a32020; }
        .patient-report-vital-empty {
          margin-top: 7px;
          font-size: 14.5px;
          line-height: 1.4;
          color: #5a7071;
        }
        .patient-report-grid-2 {
          margin-top: 22px;
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 18px;
        }
        .patient-report-info-box {
          padding: 24px 24px 22px;
        }
        .patient-report-info-box h3,
        .patient-report-detail-group h3 {
          margin: 0;
          font-size: 24px;
          line-height: 1.15;
          color: #123132;
        }
        .patient-report-info-box p,
        .patient-report-detail-group p {
          margin: 10px 0 0;
          font-size: 17px;
          line-height: 1.5;
          color: #4d6667;
        }
        .patient-report-highlight-list {
          display: grid;
          gap: 12px;
          margin-top: 16px;
        }
        .patient-report-highlight {
          border-radius: 16px;
          padding: 13px 14px;
          font-size: 16px;
          line-height: 1.45;
          background: rgba(0, 131, 141, 0.08);
          color: #006a73;
          border: 1px solid rgba(0, 131, 141, 0.16);
        }
        .patient-report-highlight.tone-warn {
          background: rgba(199, 93, 0, 0.10);
          color: #9a4a00;
          border-color: rgba(199, 93, 0, 0.18);
        }
        .patient-report-highlight.tone-danger {
          background: rgba(198, 40, 40, 0.10);
          color: #a32020;
          border-color: rgba(198, 40, 40, 0.18);
        }
        .patient-report-muted-box {
          padding: 18px 20px;
          font-size: 16px;
          line-height: 1.45;
          color: #5f7475;
        }
        .patient-report-footer {
          position: absolute;
          left: 58px;
          right: 58px;
          bottom: 34px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          align-items: stretch;
          padding-top: 10px;
          border-top: 1px solid #dde8e8;
          font-size: 13px;
          line-height: 1.38;
          color: #6b7d7d;
        }
        .patient-report-footer-note {
          min-width: 0;
          display: block;
          text-align: left;
          text-justify: auto;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          word-spacing: normal;
          letter-spacing: 0;
          -webkit-hyphens: none;
          hyphens: none;
        }
        .patient-report-footer-source {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
          text-align: left;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
          word-spacing: normal;
          letter-spacing: 0;
          font-weight: 400;
        }
        .patient-report-footer-source-title {
          font-weight: 700;
        }
        .patient-report-footer-source-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .patient-report-footer-source-line {
          min-width: 0;
          display: block;
        }
        .patient-report-page.is-child .patient-report-footer {
          bottom: 38px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
          column-gap: 18px;
          row-gap: 0;
          padding-top: 0;
          border-top: none;
          font-size: 14px;
          line-height: 1.35;
        }
        .patient-report-page.is-child .patient-report-footer-note {
          display: block;
        }
        .patient-report-page.is-child .patient-report-footer-source {
          display: block;
          text-align: right;
          white-space: nowrap;
          overflow-wrap: normal;
          word-break: normal;
        }
        .patient-report-page.is-child .patient-report-footer-source-compact {
          font-weight: 400;
        }
        .patient-report-page.is-child .patient-report-footer-source-title,
        .patient-report-page.is-child .patient-report-footer-source-inline {
          display: inline;
          white-space: nowrap;
        }
        .patient-report-page.is-child .patient-report-footer-source-title {
          margin-right: 4px;
          font-weight: 700;
        }
      </style>
      <section class="patient-report-page ${isAdult ? 'is-adult' : 'is-child'}">
        <div class="patient-report-header">
          <div class="patient-report-brand">
            <div class="patient-report-brand-kicker">wagaiwzrost.pl</div>
            <h1 class="patient-report-title" aria-label="${patientReportEscapeHtml(model.title)}">${patientReportBuildSafeTitleHtml(model.title)}</h1>
            ${model.subtitle ? `<p class="patient-report-subtitle">${patientReportEscapeHtml(model.subtitle)}</p>` : ''}
          </div>
          <div class="patient-report-meta">${metaHtml}</div>
        </div>
        <section class="patient-report-hero tone-${patientReportEscapeHtml(model.headline.tone || 'normal')}">
          <h2>${patientReportEscapeHtml(model.headline.title || '')}</h2>
          ${model.headline.text ? `<p>${patientReportEscapeHtml(model.headline.text || '')}</p>` : ''}
          ${model.headline.subtext ? `<p>${patientReportEscapeHtml(model.headline.subtext || '')}</p>` : ''}
        </section>
        <section class="patient-report-grid-3">
          ${cardsHtml}
        </section>
        <section class="patient-report-secondary-grid${model.secondaryCardCount === 2 ? ' is-two-col' : ''}">
          ${secondaryCardsHtml}
        </section>
        <div class="patient-report-footer">
          <div class="patient-report-footer-note">Raport ma charakter informacyjny i stanowi uzupełnienie omówienia wyników podczas wizyty.</div>
          ${footerSourceHtml}
        </div>
      </section>
    </div>`;
}

function patientReportShowToast(message) {
  try {
    const existing = document.getElementById('patientReportPdfToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'patientReportPdfToast';
    toast.textContent = message || 'Raport PDF został wygenerowany.';
    toast.style.position = 'fixed';
    toast.style.bottom = '1rem';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#00838d';
    toast.style.color = '#fff';
    toast.style.padding = '0.65rem 1.25rem';
    toast.style.borderRadius = '10px';
    toast.style.fontSize = '0.98rem';
    toast.style.zIndex = '99999';
    toast.style.boxShadow = '0 10px 24px rgba(0,0,0,0.18)';
    document.body.appendChild(toast);
    setTimeout(() => { try { toast.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17039 });
    }
  } }, 2800);
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17040 });
    }
  }
}

function patientReportDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function patientReportWaitForStableLayout() {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17049 });
    }
  }
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function patientReportCreateRenderHost(widthPx) {
  const host = document.createElement('div');
  const safeWidth = Math.max(1, Number(widthPx) || 0);
  host.style.position = 'absolute';
  host.style.left = '-20000px';
  host.style.top = '0';
  host.style.width = `${safeWidth}px`;
  host.style.maxWidth = `${safeWidth}px`;
  host.style.zIndex = '-1';
  host.style.pointerEvents = 'none';
  host.style.opacity = '1';
  host.style.webkitTextSizeAdjust = 'none';
  host.style.textSizeAdjust = 'none';
  host.setAttribute('aria-hidden', 'true');
  return host;
}

const PATIENT_REPORT_PDF_RENDER_SCALE = 2.25;
const PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH = 2200;
const PATIENT_REPORT_PDF_JPEG_QUALITY = 0.92;
const PATIENT_REPORT_PDF_PNG_RATIO_LIMIT = 1.4;
const PATIENT_REPORT_PDF_PNG_RATIO_LIMIT_PREFERRED = 1.7;
const PATIENT_REPORT_PDF_VISIT_PREFERRED_FORMAT = 'JPEG';
const PATIENT_REPORT_PDF_IMAGE_COMPRESSION = 'FAST';

function patientReportResolveRenderScale(elementOrWidth, options = {}) {
  const desiredScale = Number.isFinite(options.desiredScale) && options.desiredScale > 0
    ? options.desiredScale
    : PATIENT_REPORT_PDF_RENDER_SCALE;
  const maxExportWidth = Number.isFinite(options.maxExportWidth) && options.maxExportWidth > 0
    ? options.maxExportWidth
    : PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH;

  let sourceWidth = 0;
  if (Number.isFinite(elementOrWidth) && elementOrWidth > 0) {
    sourceWidth = elementOrWidth;
  } else if (elementOrWidth && typeof elementOrWidth === 'object') {
    const rectWidth = (typeof elementOrWidth.getBoundingClientRect === 'function')
      ? elementOrWidth.getBoundingClientRect().width
      : 0;
    sourceWidth = rectWidth
      || elementOrWidth.offsetWidth
      || elementOrWidth.clientWidth
      || elementOrWidth.scrollWidth
      || 0;
  }

  if (!(sourceWidth > 0) || !(maxExportWidth > 0)) {
    return desiredScale;
  }

  const cappedScale = maxExportWidth / sourceWidth;
  if (!Number.isFinite(cappedScale) || cappedScale <= 0) {
    return desiredScale;
  }

  return Math.max(1, Math.min(desiredScale, cappedScale));
}

function patientReportResizeCanvasForPdf(sourceCanvas, maxWidth = PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH) {
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return sourceCanvas;
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || sourceCanvas.width <= maxWidth) return sourceCanvas;

  const ratio = maxWidth / sourceCanvas.width;
  const targetWidth = Math.max(1, Math.round(sourceCanvas.width * ratio));
  const targetHeight = Math.max(1, Math.round(sourceCanvas.height * ratio));
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const ctx = exportCanvas.getContext('2d', { alpha: false });
  if (!ctx) return sourceCanvas;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  try {
    ctx.imageSmoothingQuality = 'high';
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17130 });
    }
  }
  ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return exportCanvas;
}

function patientReportEstimateDataUrlBytes(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return Number.POSITIVE_INFINITY;
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex < 0) return Number.POSITIVE_INFINITY;
  const base64Length = dataUrl.length - commaIndex - 1;
  return Math.ceil((base64Length * 3) / 4);
}

function patientReportCanvasToPdfImage(canvas, options = {}) {
  const preferPng = !!(options && options.preferPng);
  const preferredFormat = String(options && options.preferredFormat ? options.preferredFormat : '').trim().toUpperCase();
  const skipPngProbe = !!(options && options.skipPngProbe);
  const maxWidth = Number.isFinite(options && options.maxWidth) && options.maxWidth > 0
    ? options.maxWidth
    : PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH;
  const requestedJpegQuality = Number.isFinite(options && options.jpegQuality)
    ? options.jpegQuality
    : PATIENT_REPORT_PDF_JPEG_QUALITY;
  const jpegQuality = Math.max(0.5, Math.min(1, requestedJpegQuality));
  const exportCanvas = patientReportResizeCanvasForPdf(canvas, maxWidth);

  let cachedJpeg;
  let cachedPng;

  function encode(format) {
    const normalizedFormat = format === 'PNG' ? 'PNG' : 'JPEG';
    const mimeType = normalizedFormat === 'PNG' ? 'image/png' : 'image/jpeg';
    try {
      const dataUrl = exportCanvas.toDataURL(mimeType, normalizedFormat === 'JPEG' ? jpegQuality : undefined);
      if (typeof dataUrl === 'string' && dataUrl.startsWith(`data:${mimeType}`)) {
        return { dataUrl, format: normalizedFormat };
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17167 });
    }
  }
    return null;
  }

  function getJpeg() {
    if (typeof cachedJpeg === 'undefined') {
      cachedJpeg = encode('JPEG') || false;
    }
    return cachedJpeg || null;
  }

  function getPng() {
    if (typeof cachedPng === 'undefined') {
      cachedPng = encode('PNG') || false;
    }
    return cachedPng || null;
  }

  if (preferredFormat === 'PNG') {
    return getPng() || getJpeg() || { dataUrl: exportCanvas.toDataURL('image/png'), format: 'PNG' };
  }
  if (preferredFormat === 'JPEG' || preferredFormat === 'JPG') {
    return getJpeg() || getPng() || { dataUrl: exportCanvas.toDataURL('image/png'), format: 'PNG' };
  }

  if (skipPngProbe) {
    return (preferPng ? (getPng() || getJpeg()) : (getJpeg() || getPng()))
      || { dataUrl: exportCanvas.toDataURL('image/png'), format: 'PNG' };
  }

  const jpegImage = getJpeg();
  const pngImage = getPng();

  if (jpegImage && pngImage) {
    const jpegBytes = patientReportEstimateDataUrlBytes(jpegImage.dataUrl);
    const pngBytes = patientReportEstimateDataUrlBytes(pngImage.dataUrl);
    const ratioLimit = preferPng ? PATIENT_REPORT_PDF_PNG_RATIO_LIMIT_PREFERRED : PATIENT_REPORT_PDF_PNG_RATIO_LIMIT;
    if (Number.isFinite(jpegBytes) && Number.isFinite(pngBytes) && pngBytes <= (jpegBytes * ratioLimit)) {
      return pngImage;
    }
    return jpegImage;
  }

  if (pngImage) return pngImage;
  if (jpegImage) return jpegImage;

  const fallbackUrl = exportCanvas.toDataURL('image/png');
  return { dataUrl: fallbackUrl, format: 'PNG' };
}


let __patientReportPdfInFlight = false;

function patientReportDownloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) return;
  const safeFilename = String(filename || 'raport.pdf').trim() || 'raport.pdf';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    try { URL.revokeObjectURL(url); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17230 });
    }
  }
    try { link.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17231 });
    }
  }
  }, 0);
}

async function patientReportRunExternalPdfTask(triggerBtn, taskFn, busyLabel) {
  if (__patientReportPdfInFlight) return false;
  __patientReportPdfInFlight = true;

  const btn = triggerBtn || null;
  const originalNodes = btn && btn.childNodes ? Array.prototype.slice.call(btn.childNodes).map(function (node) { return node.cloneNode(true); }) : null;
  const originalText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = busyLabel || 'Przygotowywanie PDF…';
  }

  try {
    await taskFn();
    return true;
  } finally {
    if (btn) {
      btn.disabled = false;
      if (originalNodes && originalNodes.length) {
        vildaAppRestoreClonedChildren(btn, originalNodes, 'app:button-restore');
      } else {
        btn.textContent = originalText || 'Raport PDF dla pacjenta';
      }
    }
    __patientReportPdfInFlight = false;
  }
}

async function patientReportBuildPdfPackage() {
  const lines = getFormattedProfessionalSummaryLines();
  if (!Array.isArray(lines) || !lines.length) {
    throw new Error('Brak danych do wygenerowania raportu PDF.');
  }
  vildaEnsureGlobalDependencyContract('patient-report-pdf', { silent: true, showUi: true, message: 'Brakuje bibliotek potrzebnych do wygenerowania raportu pacjenta PDF.' });
  const patientPdfJsPDF = vildaRequireGlobalFunction('jspdf.jsPDF', 'patient-report-pdf', { silent: true });
  const patientPdfHtml2Canvas = vildaRequireGlobalFunction('html2canvas', 'patient-report-pdf', { silent: true });
  if (!patientPdfJsPDF || !patientPdfHtml2Canvas) {
    throw new Error('Brakuje bibliotek potrzebnych do wygenerowania PDF.');
  }

  const host = patientReportCreateRenderHost(1240);

  try {
    const model = patientReportBuildModel();
    vildaAppSetTrustedHtml(host, patientReportBuildHtml(model), 'app:host');
    document.body.appendChild(host);
    await patientReportWaitForStableLayout();

    const pages = Array.from(host.querySelectorAll('.patient-report-page'));
    if (!pages.length) throw new Error('Brak stron raportu do renderowania.');

    const pdf = new patientPdfJsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
      putOnlyUsedFonts: true
    });
    pdf.setProperties({
      title: 'Raport po wizycie',
      subject: 'Raport po wizycie',
      author: 'wagaiwzrost.pl'
    });

    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      const renderScale = patientReportResolveRenderScale(page);
      const canvas = await patientPdfHtml2Canvas(page, {
        scale: renderScale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0
      });
      const pdfImage = patientReportCanvasToPdfImage(canvas, {
        preferredFormat: PATIENT_REPORT_PDF_VISIT_PREFERRED_FORMAT,
        skipPngProbe: true
      });
      if (i > 0) pdf.addPage();
      pdf.addImage(pdfImage.dataUrl, pdfImage.format, 0, 0, 210, 297, undefined, PATIENT_REPORT_PDF_IMAGE_COMPRESSION);
    }

    const filenameBase = patientReportSanitizeFilename(model.name || 'pacjent');
    return {
      blob: pdf.output('blob'),
      filename: `Raport_po_wizycie_${filenameBase || 'pacjent'}.pdf`
    };
  } finally {
    try { host.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17319 });
    }
  }
  }
}

async function generatePatientReportPdf(triggerBtn) {
  try {
    await patientReportRunExternalPdfTask(triggerBtn, async () => {
      const pdfPackage = await patientReportBuildPdfPackage();
      if (!pdfPackage || !(pdfPackage.blob instanceof Blob)) {
        throw new Error('Nie udało się przygotować pliku PDF.');
      }
      patientReportDownloadBlob(pdfPackage.blob, pdfPackage.filename);
      patientReportShowToast('Raport PDF został wygenerowany.');
    }, 'Przygotowywanie PDF…');
  } catch (error) {
    vildaLogAppError('patient-report-pdf', 'Błąd generowania raportu PDF dla pacjenta', error);
    console.error('Błąd generowania raportu PDF dla pacjenta:', error);
    if (!(error && error.vildaDependencyError)) {
      patientReportShowToast(error && error.message ? error.message : 'Nie udało się wygenerować raportu PDF. Spróbuj ponownie.');
    }
  }
}

function patientReportGetCentileChartSelectionState() {
  let state = null;
  try {
    vildaEnsureGlobalDependencyContract('patient-report-centile-chart', { silent: true, message: 'Brakuje danych lub funkcji potrzebnych do wygenerowania wykresów centylowych.' });
  const getChartState = vildaRequireGlobalFunction('getCentileChartState', 'patient-report-centile-chart', { silent: true });
    state = getChartState ? getChartState() : null;
  } catch (error) {
    vildaLogAppWarn('patient-report-centile-chart', 'Nie udało się odczytać stanu siatki centylowej do raportu', error);
    state = null;
  }
  const source = String(state && state.source ? state.source : '').toUpperCase();
  const sourceLabel = advHistorySourceLabel(source || '');
  const palczewskaChartGenerator = vildaRequireGlobalFunction('generatePalczewskaCentileCharts', 'patient-report-centile-chart', { silent: true });
  const standardChartGenerator = vildaRequireGlobalFunction('generateCentileChart', 'patient-report-centile-chart', { silent: true });
  const available = !!(
    state &&
    state.visible !== false &&
    state.supported &&
    ((source === 'PALCZEWSKA' && palczewskaChartGenerator) || standardChartGenerator)
  );
  return {
    available,
    source,
    sourceLabel,
    message: (state && state.message) ? state.message : '',
    hint: (state && state.hint) ? state.hint : ''
  };
}

async function generatePatientCentileChartPdf(triggerBtn) {
  const chartState = patientReportGetCentileChartSelectionState();
  if (!chartState.available) {
    const depsReady = vildaCheckGlobalDependencyContract('patient-report-centile-chart', { silent: true });
    if (depsReady && depsReady.ok === false) {
      vildaEnsureGlobalDependencyContract('patient-report-centile-chart', {
        silent: true,
        showUi: true,
        throwOnMissing: false,
        message: 'Brakuje danych lub funkcji potrzebnych do wygenerowania wykresów centylowych.'
      });
    } else {
      patientReportShowToast(chartState.message || 'Siatka centylowa nie jest obecnie dostępna.');
    }
    return;
  }

  try {
    await patientReportRunExternalPdfTask(triggerBtn, async () => {
      if (chartState.source === 'PALCZEWSKA') {
        const generatePalczewska = vildaRequireGlobalFunction('generatePalczewskaCentileCharts', 'patient-report-centile-chart');
        if (!generatePalczewska) throw new Error('Generator siatek Palczewska nie jest obecnie dostępny.');
        await generatePalczewska();
        return;
      }
      const previousOverride = (typeof window !== 'undefined') ? window.overrideCentileSource : undefined;
      try {
        if (typeof window !== 'undefined') {
          window.overrideCentileSource = chartState.source || undefined;
        }
        const generateStandardChart = vildaRequireGlobalFunction('generateCentileChart', 'patient-report-centile-chart');
        if (!generateStandardChart) throw new Error('Generator siatek centylowych nie jest obecnie dostępny.');
        await generateStandardChart();
      } finally {
        if (typeof window !== 'undefined') {
          window.overrideCentileSource = previousOverride;
        }
      }
    }, 'Przygotowywanie PDF…');
  } catch (error) {
    vildaLogAppError('patient-report-centile-chart', 'Błąd generowania siatki centylowej z okna wyboru PDF', error);
    console.error('Błąd generowania siatki centylowej z okna wyboru PDF:', error);
    patientReportShowToast('Nie udało się wygenerować siatki centylowej. Spróbuj ponownie.');
  }
}

function patientReportHasAdvancedGrowthPdfAvailable() {
  try {
    const collectHistory = vildaRequireGlobalFunction('advGrowthCollectHistoricalPointsForReport', 'patient-report-advanced-growth', { silent: true });
    const generateGrowthReport = vildaRequireGlobalFunction('generateAdvancedGrowthPdfReport', 'patient-report-advanced-growth', { silent: true });
    return !!(collectHistory && collectHistory().length >= 1 && generateGrowthReport);
  } catch (_) {
    return false;
  }
}

async function generatePatientAdvancedGrowthPdf(triggerBtn) {
  if (!patientReportHasAdvancedGrowthPdfAvailable()) {
    const depsReady = vildaCheckGlobalDependencyContract('patient-report-advanced-growth', { silent: true });
    if (depsReady && depsReady.ok === false) {
      vildaEnsureGlobalDependencyContract('patient-report-advanced-growth', {
        silent: true,
        showUi: true,
        throwOnMissing: false,
        message: 'Brakuje funkcji potrzebnych do raportu zaawansowanego wzrastania.'
      });
    } else {
      patientReportShowToast('Raport wzrastania nie jest obecnie dostępny.');
    }
    return;
  }

  try {
    await patientReportRunExternalPdfTask(triggerBtn, async () => {
      const generateGrowthReport = vildaRequireGlobalFunction('generateAdvancedGrowthPdfReport', 'patient-report-advanced-growth');
      if (!generateGrowthReport) throw new Error('Generator raportu wzrastania nie jest obecnie dostępny.');
      await generateGrowthReport();
    }, 'Przygotowywanie PDF…');
  } catch (error) {
    console.error('Błąd generowania raportu wzrastania z okna wyboru PDF:', error);
    patientReportShowToast('Nie udało się wygenerować raportu wzrastania. Spróbuj ponownie.');
  }
}


function patientReportGetPdfChoiceOptions() {
  const options = [];

  try {
    const lines = getFormattedProfessionalSummaryLines();
    if (Array.isArray(lines) && lines.length) {
      options.push({
        value: 'visit',
        title: 'Raport po wizycie',
        description: 'Pełny raport z podsumowaniem wyników, interpretacją i kartami pomocniczymi.',
        checkedByDefault: true
      });
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17469 });
    }
  }

  try {
    if (typeof window !== 'undefined'
      && typeof window.dietRecommendationsHasPdfAvailable === 'function'
      && window.dietRecommendationsHasPdfAvailable()) {
      options.push({
        value: 'diet',
        title: 'Raport zaleceń dietetycznych',
        description: 'Osobny PDF, w którym obliczenia energetyczne i codzienne cele są połączone w jeden plan zaleceń.',
        checkedByDefault: false
      });
    }
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17482 });
    }
  }

  const centileState = patientReportGetCentileChartSelectionState();
  if (centileState.available) {
    options.push({
      value: 'centile',
      title: `Siatka centylowa${centileState.sourceLabel ? ` (${centileState.sourceLabel})` : ''}`,
      description: 'PDF z aktualną siatką centylową zgodną z wcześniej wybranym źródłem danych.',
      checkedByDefault: false
    });
  }

  if (patientReportHasAdvancedGrowthPdfAvailable()) {
    options.push({
      value: 'growth',
      title: 'Raport wzrastania',
      description: 'Raport z karty Zaawansowane obliczenia wzrostowe, jeśli dostępne są punkty historyczne.',
      checkedByDefault: false
    });
  }

  if (options.length && !options.some((option) => option.checkedByDefault)) {
    options[0].checkedByDefault = true;
  }

  return options;
}

function patientReportGetPdfChoiceOptionMeta(value) {
  return patientReportGetPdfChoiceOptions().find((option) => option.value === value) || null;
}

function patientReportResolveFilenameBase() {
  let rawName = '';
  try {
    const model = (typeof patientReportBuildModel === 'function') ? patientReportBuildModel() : null;
    rawName = String(
      (model && model.name)
      || document.getElementById('name')?.value
      || document.getElementById('advName')?.value
      || ''
    );
  } catch (_) {
    rawName = String(document.getElementById('name')?.value || document.getElementById('advName')?.value || '');
  }
  return patientReportSanitizeFilename(rawName || 'pacjent') || 'pacjent';
}

function patientReportBuildPdfPageSpecFromCanvas(canvas, options) {
  if (!canvas) return null;
  const opts = options || {};
  const orientation = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
  const defaultWidthMm = orientation === 'landscape' ? 297 : 210;
  const defaultHeightMm = orientation === 'landscape' ? 210 : 297;

  let format = opts.format === 'PNG' ? 'PNG' : 'JPEG';
  let dataUrl = '';

  const requestedFormat = String(opts.preferredFormat || '').trim().toUpperCase();
  const pdfImage = patientReportCanvasToPdfImage(canvas, {
    preferredFormat: requestedFormat || (opts.strategy === 'patient'
      ? PATIENT_REPORT_PDF_VISIT_PREFERRED_FORMAT
      : format),
    preferPng: format === 'PNG',
    skipPngProbe: true,
    jpegQuality: Number.isFinite(opts.jpegQuality) ? opts.jpegQuality : PATIENT_REPORT_PDF_JPEG_QUALITY,
    maxWidth: Number.isFinite(opts.maxWidth) ? opts.maxWidth : PATIENT_REPORT_PDF_MAX_EXPORT_WIDTH
  });
  format = pdfImage && pdfImage.format ? pdfImage.format : format;
  dataUrl = pdfImage && pdfImage.dataUrl ? pdfImage.dataUrl : '';

  return {
    orientation,
    format,
    dataUrl,
    widthMm: Number.isFinite(opts.widthMm) ? opts.widthMm : defaultWidthMm,
    heightMm: Number.isFinite(opts.heightMm) ? opts.heightMm : defaultHeightMm
  };
}

function patientReportSliceCanvasToPageSpecs(canvas, options) {
  if (!canvas) return [];
  const opts = options || {};
  const orientation = opts.orientation === 'landscape' ? 'landscape' : 'portrait';
  const pageWidthMm = orientation === 'landscape' ? 297 : 210;
  const pageHeightMm = orientation === 'landscape' ? 210 : 297;
  const sliceHeightPx = Math.max(1, Math.floor((canvas.width * pageHeightMm) / pageWidthMm));
  const pages = [];

  for (let offsetY = 0; offsetY < canvas.height; offsetY += sliceHeightPx) {
    const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - offsetY);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = currentSliceHeight;
    const ctx = sliceCanvas.getContext('2d');
    if (!ctx) continue;
    ctx.drawImage(canvas, 0, offsetY, canvas.width, currentSliceHeight, 0, 0, canvas.width, currentSliceHeight);
    pages.push(patientReportBuildPdfPageSpecFromCanvas(sliceCanvas, {
      orientation,
      format: opts.format === 'JPEG' ? 'JPEG' : 'PNG',
      widthMm: pageWidthMm,
      heightMm: (currentSliceHeight * pageWidthMm) / canvas.width
    }));
  }

  return pages.filter(Boolean);
}

async function patientReportCollectVisitPdfPages() {
  const lines = getFormattedProfessionalSummaryLines();
  if (!Array.isArray(lines) || !lines.length) {
    throw new Error('Brak danych do wygenerowania raportu po wizycie.');
  }
  vildaEnsureGlobalDependencyContract('patient-report-visit-pages', { silent: true, showUi: true, message: 'Brakuje bibliotek potrzebnych do wygenerowania dodatkowych stron raportu.' });
  const visitPdfJsPDF = vildaRequireGlobalFunction('jspdf.jsPDF', 'patient-report-visit-pages', { silent: true });
  const visitPdfHtml2Canvas = vildaRequireGlobalFunction('html2canvas', 'patient-report-visit-pages', { silent: true });
  if (!visitPdfJsPDF || !visitPdfHtml2Canvas) {
    throw new Error('Brakuje bibliotek potrzebnych do wygenerowania PDF.');
  }

  const host = patientReportCreateRenderHost(1240);

  try {
    const model = patientReportBuildModel();
    vildaAppSetTrustedHtml(host, patientReportBuildHtml(model), 'app:host');
    document.body.appendChild(host);
    await patientReportWaitForStableLayout();

    const pageNodes = Array.from(host.querySelectorAll('.patient-report-page'));
    if (!pageNodes.length) throw new Error('Brak stron raportu do renderowania.');

    const pages = [];
    for (let i = 0; i < pageNodes.length; i += 1) {
      const pageNode = pageNodes[i];
      const renderScale = patientReportResolveRenderScale(pageNode);
      const canvas = await visitPdfHtml2Canvas(pageNode, {
        scale: renderScale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0
      });
      const pageSpec = patientReportBuildPdfPageSpecFromCanvas(canvas, {
        orientation: 'portrait',
        strategy: 'patient',
        preferredFormat: PATIENT_REPORT_PDF_VISIT_PREFERRED_FORMAT
      });
      if (pageSpec) pages.push(pageSpec);
    }

    return {
      pages,
      filenameBase: patientReportSanitizeFilename(model.name || 'pacjent') || patientReportResolveFilenameBase()
    };
  } finally {
    try { host.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17637 });
    }
  }
  }
}


function patientReportGetPalczewskaPdfHelpers() {
  const globalObj = (typeof window !== 'undefined') ? window : globalThis;
  const resolveFn = function(name) {
    try {
      if (typeof globalObj !== 'undefined' && globalObj && typeof globalObj[name] === 'function') {
        return globalObj[name];
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17649 });
    }
  }
    try {
      if (name === 'getPalczewskaChartPlan' && typeof getPalczewskaChartPlan === 'function') return getPalczewskaChartPlan;
      if (name === 'buildPalczewskaInfantPageCanvas' && typeof buildPalczewskaInfantPageCanvas === 'function') return buildPalczewskaInfantPageCanvas;
      if (name === 'buildPalczewskaExtendedCanvases' && typeof buildPalczewskaExtendedCanvases === 'function') return buildPalczewskaExtendedCanvases;
      if (name === 'promptPalczewskaRangeSelection' && typeof promptPalczewskaRangeSelection === 'function') return promptPalczewskaRangeSelection;
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17655 });
    }
  }
    return null;
  };
  return {
    getPlan: resolveFn('getPalczewskaChartPlan'),
    buildInfantCanvas: resolveFn('buildPalczewskaInfantPageCanvas'),
    buildExtendedCanvases: resolveFn('buildPalczewskaExtendedCanvases'),
    promptRangeSelection: resolveFn('promptPalczewskaRangeSelection')
  };
}

async function patientReportCollectCentileChartPdfPages() {
  const chartState = patientReportGetCentileChartSelectionState();
  if (!chartState.available) {
    throw new Error(chartState.message || 'Siatka centylowa nie jest obecnie dostępna.');
  }

  const ageEl = document.getElementById('age');
  const ageMonthsEl = document.getElementById('ageMonths');
  const weightEl = document.getElementById('weight');
  const heightEl = document.getElementById('height');
  const sexEl = document.getElementById('sex');
  const yearsVal = parseFloat(ageEl?.value) || 0;
  const monthsVal = ageMonthsEl ? (parseFloat(ageMonthsEl.value) || 0) : 0;
  const ageYears = yearsVal + monthsVal / 12;
  const weight = parseFloat(weightEl?.value);
  const height = parseFloat(heightEl?.value);
  const sex = (sexEl && sexEl.value === 'M') ? 'M' : 'F';

  if (!Number.isFinite(ageYears) || !Number.isFinite(weight) || !Number.isFinite(height)) {
    throw new Error('Wprowadź poprawne dane liczbowe, aby wygenerować siatkę centylową.');
  }

  const ageMonths = Math.round(ageYears * 12);
  if (ageMonths < 0 || ageMonths > 216) {
    throw new Error('Siatka centylowa dostępna jest dla wieku od 0 do 18 lat.');
  }

  const selectedChartSource = String(chartState.source || 'OLAF').toUpperCase();

  if (selectedChartSource === 'PALCZEWSKA') {
    const palczewskaHelpers = patientReportGetPalczewskaPdfHelpers();
    if (!palczewskaHelpers.getPlan
      || !palczewskaHelpers.buildInfantCanvas
      || !palczewskaHelpers.buildExtendedCanvases) {
      throw new Error('Generator siatki Palczewskiej nie jest obecnie dostępny.');
    }

    const adv = (typeof window !== 'undefined' && window.advancedGrowthData) ? window.advancedGrowthData : null;
    const plan = palczewskaHelpers.getPlan(ageMonths, adv);
    let mode = plan && plan.mode ? plan.mode : 'INFANT_ONLY';

    if (mode === 'CHOICE') {
      if (palczewskaHelpers.promptRangeSelection) {
        const selectedMode = await palczewskaHelpers.promptRangeSelection();
        if (!selectedMode) {
          const cancelError = new Error('Anulowano wybór zakresu siatki Palczewskiej.');
          cancelError.code = 'USER_CANCELLED';
          throw cancelError;
        }
        mode = selectedMode;
      } else {
        mode = 'INFANT_ONLY';
      }
    }

    const canvases = [];
    if (mode === 'INFANT_ONLY' || mode === 'BOTH_REQUIRED') {
      canvases.push(palczewskaHelpers.buildInfantCanvas({
        sex,
        userAgeMonths: ageMonths,
        userWeight: weight,
        userHeight: height
      }));
    }
    if (mode === 'EXTENDED_ONLY' || mode === 'BOTH_REQUIRED') {
      canvases.push(...palczewskaHelpers.buildExtendedCanvases({
        sex,
        userAgeMonths: ageMonths,
        userWeight: weight,
        userHeight: height
      }));
    }

    if (!canvases.length) {
      throw new Error('Nie udało się przygotować siatki Palczewskiej dla podanych danych.');
    }

    return {
      pages: canvases
        .map((canvas) => patientReportBuildPdfPageSpecFromCanvas(canvas, { orientation: 'portrait', format: 'JPEG' }))
        .filter(Boolean),
      filenameBase: patientReportResolveFilenameBase(),
      source: 'PALCZEWSKA'
    };
  }

  const buildCentilePageCanvasFn = vildaRequireGlobalFunction('buildCentilePageCanvas', 'patient-report-centile-chart');
  if (!buildCentilePageCanvasFn) {
    throw new Error('Generator siatki centylowej nie jest obecnie dostępny.');
  }

  const previousAdvanced = (typeof window !== 'undefined' && typeof window.advancedGrowthData !== 'undefined')
    ? window.advancedGrowthData
    : undefined;
  const getEffectiveChartData = vildaRequireGlobalFunction('getEffectiveCentileGrowthDataState', 'patient-report-centile-chart', { silent: true });
  const effectiveChartData = getEffectiveChartData ? getEffectiveChartData() : null;
  let advancedTemporarilyInjected = false;

  try {
    if (effectiveChartData && typeof window !== 'undefined') {
      window.advancedGrowthData = effectiveChartData;
      advancedTemporarilyInjected = true;
    }

    const adv = (typeof window !== 'undefined' && window.advancedGrowthData) ? window.advancedGrowthData : null;
    const collectAllAges = vildaRequireGlobalFunction('collectAllAgesMonths', 'patient-report-centile-chart', { silent: true });
    const ageBounds = collectAllAges
      ? collectAllAges(ageMonths, adv)
      : { minAll: ageMonths, maxAll: ageMonths };
    const minAll = Number.isFinite(ageBounds.minAll) ? ageBounds.minAll : ageMonths;
    const maxAll = Number.isFinite(ageBounds.maxAll) ? ageBounds.maxAll : ageMonths;
    const pages = [];

    function pushCentilePage(config) {
      const canvas = buildCentilePageCanvasFn({
        rangeMinX: config.minX,
        rangeMaxX: config.maxX,
        sex,
        userAgeMonths: ageMonths,
        userWeight: weight,
        userHeight: height,
        headerTitle: (sex === 'M' ? 'Siatka centylowa chłopcy' : 'Siatka centylowa dziewczynki'),
        headerSubtitle: config.subtitle,
        footerText: config.footer,
        chartSource: config.chartSource
      });
      const pageSpec = patientReportBuildPdfPageSpecFromCanvas(canvas, { orientation: 'portrait', format: 'JPEG' });
      if (pageSpec) pages.push(pageSpec);
    }

    if (selectedChartSource === 'WHO') {
      pushCentilePage({
        minX: 0,
        maxX: 35,
        subtitle: 'Dane: WHO, wiek 0 - 3 lata',
        footer: 'Dane do siatek: WHO (0–<3 lata)',
        chartSource: 'WHO'
      });
    } else {
      const spansAcross3yo = (minAll < 36) && (maxAll > 36);
      if (spansAcross3yo) {
        pushCentilePage({
          minX: 0,
          maxX: 35,
          subtitle: 'Zakres: 0–<3 lata',
          footer: 'Dane do siatek: Palczewska & Niedźwiecka (0–<3 lata)',
          chartSource: 'PALCZEWSKA'
        });
        pushCentilePage({
          minX: 36,
          maxX: 216,
          subtitle: 'Badanie OLAF (3–18 lat)',
          footer: '',
          chartSource: 'OLAF'
        });
      } else if (maxAll <= 35) {
        pushCentilePage({
          minX: 0,
          maxX: 35,
          subtitle: 'Zakres: 0–<3 lata',
          footer: 'Dane do siatek: Palczewska & Niedźwiecka (0–<3 lata)',
          chartSource: 'PALCZEWSKA'
        });
      } else {
        pushCentilePage({
          minX: 36,
          maxX: 216,
          subtitle: 'Badanie OLAF (3–18 lat)',
          footer: '',
          chartSource: 'OLAF'
        });
      }
    }

    if (!pages.length) {
      throw new Error('Nie udało się przygotować siatki centylowej.');
    }

    return {
      pages,
      filenameBase: patientReportResolveFilenameBase(),
      source: selectedChartSource
    };
  } finally {
    if (advancedTemporarilyInjected) {
      if (typeof previousAdvanced === 'undefined') {
        try { delete window.advancedGrowthData; } catch (_) { window.advancedGrowthData = null; }
      } else {
        window.advancedGrowthData = previousAdvanced;
      }
    }
  }
}

async function patientReportCollectAdvancedGrowthPdfPages() {
  if (!patientReportHasAdvancedGrowthPdfAvailable()) {
    throw new Error('Raport wzrastania nie jest obecnie dostępny.');
  }
  vildaEnsureGlobalDependencyContract('patient-report-advanced-growth', { silent: true, showUi: true, message: 'Brakuje funkcji potrzebnych do raportu zaawansowanego wzrastania.' });
  const buildGrowthReportRows = vildaRequireGlobalFunction('advGrowthBuildReportRows', 'patient-report-advanced-growth', { silent: true });
  const buildGrowthReportMarkup = vildaRequireGlobalFunction('advGrowthBuildHtmlReportMarkup', 'patient-report-advanced-growth', { silent: true });
  if (!buildGrowthReportRows || !buildGrowthReportMarkup) {
    throw new Error('Generator raportu wzrastania nie jest obecnie dostępny.');
  }
  const growthPdfHtml2Canvas = vildaRequireGlobalFunction('html2canvas', 'patient-report-advanced-growth', { silent: true });
  if (!growthPdfHtml2Canvas) {
    throw new Error('Brakuje biblioteki potrzebnej do przygotowania raportu wzrastania.');
  }

  const report = buildGrowthReportRows();
  if (!report || !Array.isArray(report.rows) || !report.rows.length || report.historicalCount < 1) {
    throw new Error('Brak historycznych punktów pomiarowych do raportu wzrastania.');
  }

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-20000px';
  host.style.top = '0';
  host.style.width = '1120px';
  host.style.maxWidth = '1120px';
  host.style.pointerEvents = 'none';
  host.style.opacity = '1';
  host.style.zIndex = '-1';
  vildaAppSetTrustedHtml(host, buildGrowthReportMarkup(report), 'app:host');
  document.body.appendChild(host);

  try {
    await patientReportWaitForStableLayout();

    const reportNode = host.querySelector('.adv-growth-pdf-html-root') || host;
    const renderScale = patientReportResolveRenderScale(reportNode);
    const canvas = await growthPdfHtml2Canvas(reportNode, {
      scale: renderScale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });

    return {
      pages: patientReportSliceCanvasToPageSpecs(canvas, { orientation: 'landscape', format: 'PNG' }),
      filenameBase: patientReportResolveFilenameBase()
    };
  } finally {
    try { host.remove(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 17909 });
    }
  }
  }
}

function patientReportBuildSelectedPdfFilename(selectedValues, filenameBase, meta) {
  const base = filenameBase || 'pacjent';
  const selected = Array.isArray(selectedValues) ? selectedValues.slice() : [];
  const details = meta || {};

  if (selected.length === 1) {
    if (selected[0] === 'visit') return `Raport_po_wizycie_${base}.pdf`;
    if (selected[0] === 'diet') return `Raport_zalecen_dietetycznych_${base}.pdf`;
    if (selected[0] === 'growth') return `Raport_wzrastania_${base}.pdf`;
    if (selected[0] === 'centile') {
      const sourceLabel = advHistorySourceLabel(details.centileSource || '') || 'siatka_centylowa';
      const sourceSlug = patientReportSanitizeFilename(sourceLabel) || 'siatka_centylowa';
      return `Siatka_centylowa_${sourceSlug}_${base}.pdf`;
    }
  }

  return `Pakiet_raportow_${base}.pdf`;
}

async function patientReportBuildSelectedPdfPackage(selectedValues) {
  vildaEnsureGlobalDependencyContract('patient-report-selected-pdf', { silent: true, showUi: true, message: 'Brakuje biblioteki jsPDF potrzebnej do wygenerowania wybranych stron raportu.' });
  const jsPDF = vildaRequireGlobalFunction('jspdf.jsPDF', 'patient-report-selected-pdf');
  if (!jsPDF) {
    throw new Error('Brakuje biblioteki jsPDF potrzebnej do wygenerowania pliku PDF.');
  }

  const availableOptions = patientReportGetPdfChoiceOptions();
  const order = availableOptions.map((option) => option.value);
  const selectedOrdered = order.filter((value) => Array.isArray(selectedValues) && selectedValues.includes(value));
  if (!selectedOrdered.length) {
    throw new Error('Wybierz co najmniej jedną część raportu PDF.');
  }

  const pageSpecs = [];
  let filenameBase = patientReportResolveFilenameBase();
  let centileSource = '';

  for (const value of selectedOrdered) {
    if (value === 'visit') {
      const visitPackage = await patientReportCollectVisitPdfPages();
      if (visitPackage && Array.isArray(visitPackage.pages)) pageSpecs.push(...visitPackage.pages);
      if (visitPackage && visitPackage.filenameBase) filenameBase = visitPackage.filenameBase;
      continue;
    }
    if (value === 'diet') {
      if (!(typeof window !== 'undefined' && typeof window.dietRecommendationsCollectPdfPages === 'function')) {
        throw new Error('Generator raportu zaleceń dietetycznych nie jest obecnie dostępny.');
      }
      const dietPackage = await window.dietRecommendationsCollectPdfPages({ mode: 'full' });
      if (dietPackage && Array.isArray(dietPackage.pages)) pageSpecs.push(...dietPackage.pages);
      if (dietPackage && dietPackage.filenameBase) filenameBase = dietPackage.filenameBase;
      continue;
    }
    if (value === 'centile') {
      const centilePackage = await patientReportCollectCentileChartPdfPages();
      if (centilePackage && Array.isArray(centilePackage.pages)) pageSpecs.push(...centilePackage.pages);
      if (centilePackage && centilePackage.filenameBase) filenameBase = centilePackage.filenameBase;
      if (centilePackage && centilePackage.source) centileSource = centilePackage.source;
      continue;
    }
    if (value === 'growth') {
      const growthPackage = await patientReportCollectAdvancedGrowthPdfPages();
      if (growthPackage && Array.isArray(growthPackage.pages)) pageSpecs.push(...growthPackage.pages);
      if (growthPackage && growthPackage.filenameBase) filenameBase = growthPackage.filenameBase;
    }
  }

  const validPages = pageSpecs.filter((page) => page && page.dataUrl);
  if (!validPages.length) {
    throw new Error('Nie udało się przygotować wybranego raportu PDF.');
  }

  const firstPage = validPages[0];
  const firstMeta = patientReportGetPdfChoiceOptionMeta(selectedOrdered[0]);
  const title = selectedOrdered.length > 1
    ? 'Pakiet raportów PDF'
    : (firstMeta && firstMeta.title ? firstMeta.title : 'Raport PDF');

  const pdf = new jsPDF({
    orientation: firstPage.orientation,
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true
  });
  pdf.setProperties({
    title,
    subject: title,
    author: 'wagaiwzrost.pl'
  });

  validPages.forEach((page, index) => {
    const pageOrientation = page.orientation === 'landscape' ? 'landscape' : 'portrait';
    if (index > 0) pdf.addPage('a4', pageOrientation);
    const compression = PATIENT_REPORT_PDF_IMAGE_COMPRESSION;
    pdf.addImage(
      page.dataUrl,
      page.format,
      0,
      0,
      Number.isFinite(page.widthMm) ? page.widthMm : (pageOrientation === 'landscape' ? 297 : 210),
      Number.isFinite(page.heightMm) ? page.heightMm : (pageOrientation === 'landscape' ? 210 : 297),
      undefined,
      compression
    );
  });

  return {
    blob: pdf.output('blob'),
    filename: patientReportBuildSelectedPdfFilename(selectedOrdered, filenameBase, { centileSource })
  };
}

async function generatePatientSelectedPdfPackage(triggerBtn, selectedValues) {
  try {
    await patientReportRunExternalPdfTask(triggerBtn, async () => {
      const pdfPackage = await patientReportBuildSelectedPdfPackage(selectedValues);
      if (!pdfPackage || !(pdfPackage.blob instanceof Blob)) {
        throw new Error('Nie udało się przygotować pliku PDF.');
      }
      patientReportDownloadBlob(pdfPackage.blob, pdfPackage.filename);
      patientReportShowToast((Array.isArray(selectedValues) && selectedValues.length > 1)
        ? 'Pakiet PDF został wygenerowany.'
        : 'Raport PDF został wygenerowany.');
    }, 'Przygotowywanie PDF…');
  } catch (error) {
    if (error && error.code === 'USER_CANCELLED') return;
    console.error('Błąd generowania wybranego raportu PDF dla pacjenta:', error);
    if (!(error && error.vildaDependencyError)) {
      patientReportShowToast(error && error.message ? error.message : 'Nie udało się wygenerować raportu PDF. Spróbuj ponownie.');
    }
  }
}

function patientReportRemovePdfChoiceDialog() {
  try {
    const backdrop = document.getElementById('patientReportPdfChoiceBackdrop');
    if (!backdrop) return;
    if (document.body && typeof backdrop.dataset.prevBodyOverflow === 'string') {
      document.body.style.overflow = backdrop.dataset.prevBodyOverflow;
    }
    if (document.documentElement && typeof backdrop.dataset.prevHtmlOverflow === 'string') {
      document.documentElement.style.overflow = backdrop.dataset.prevHtmlOverflow;
    }
    backdrop.remove();
  } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18058 });
    }
  }
}

function patientReportRefreshPdfChoiceSelection(backdrop) {
  if (!backdrop) return;
  const labels = backdrop.querySelectorAll('.patient-report-pdf-choice');
  let checkedCount = 0;
  labels.forEach((label) => {
    const input = label.querySelector('input[type="checkbox"]');
    const isSelected = !!(input && input.checked);
    if (isSelected) checkedCount += 1;
    label.classList.toggle('is-selected', isSelected);
    if (input) {
      input.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    }
  });
  const confirmBtn = backdrop.querySelector('[data-patient-report-pdf-choice-confirm]');
  if (confirmBtn) {
    confirmBtn.disabled = checkedCount === 0;
  }
}

function patientReportEnsurePdfChoiceDialogStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('patientReportPdfChoiceStyles')) return;
  const style = document.createElement('style');
  style.id = 'patientReportPdfChoiceStyles';
  style.textContent = `
    #patientReportPdfChoiceBackdrop.patient-report-pdf-choice-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10020;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      background: rgba(7, 26, 28, 0.45);
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    .patient-report-pdf-choice-dialog {
      width: min(100%, 500px);
      max-height: calc(100vh - 32px);
      max-height: min(calc(100dvh - 32px), 700px);
      display: flex;
      flex-direction: column;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 26px 72px rgba(10, 43, 47, 0.22);
      overflow: hidden;
      box-sizing: border-box;
      margin: auto;
    }
    .patient-report-pdf-choice-header-copy {
      min-width: 0;
      flex: 1 1 auto;
    }
    .patient-report-pdf-choice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 20px 0;
    }
    .patient-report-pdf-choice-title {
      margin: 0;
      font-size: 1.08rem;
      line-height: 1.25;
      color: #123132;
    }
    .patient-report-pdf-choice-description {
      margin: .4rem 0 0;
      color: #476162;
      line-height: 1.42;
      font-size: .92rem;
    }
    .patient-report-pdf-choice-close {
      border: none;
      background: transparent;
      color: #577576;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      flex: 0 0 auto;
    }
    .patient-report-pdf-choice-close:hover,
    .patient-report-pdf-choice-close:focus-visible {
      background: #eff6f6;
      outline: none;
    }
    .patient-report-pdf-choice-body {
      min-height: 0;
      overflow-y: auto;
      padding: 12px 20px 0;
      -webkit-overflow-scrolling: touch;
    }
    .patient-report-pdf-choice-form {
      display: grid;
      gap: 0;
    }
    .patient-report-pdf-choice {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      column-gap: 12px;
      padding: 12px 2px;
      margin: 0;
      cursor: pointer;
      background: transparent;
      border: none;
      border-radius: 0;
      box-sizing: border-box;
      min-width: 0;
    }
    .patient-report-pdf-choice + .patient-report-pdf-choice {
      border-top: 1px solid #edf3f3;
    }
    .patient-report-pdf-choice:focus-within {
      outline: 2px solid rgba(15, 125, 134, 0.16);
      outline-offset: 2px;
      border-radius: 10px;
    }
    .patient-report-pdf-choice-copy {
      display: grid;
      gap: .22rem;
      min-width: 0;
    }
    .patient-report-pdf-choice-option-title {
      font-weight: 700;
      color: #123132;
      line-height: 1.3;
      font-size: .98rem;
    }
    .patient-report-pdf-choice.is-selected .patient-report-pdf-choice-option-title {
      color: #0f6b73;
    }
    .patient-report-pdf-choice-option-description {
      color: #5a7273;
      font-size: .9rem;
      line-height: 1.4;
    }
    .patient-report-pdf-choice-toggle-wrap {
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      padding-top: 1px;
    }
    .patient-report-pdf-choice-toggle.switch-diet {
      margin: 0;
    }
    .patient-report-pdf-choice-toggle input {
      display: block !important;
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      opacity: 0 !important;
      margin: 0 !important;
      cursor: pointer;
    }
    .patient-report-pdf-choice-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
      padding: 16px 20px 18px;
      border-top: 1px solid #eef4f4;
      margin-top: 14px;
    }
    .patient-report-pdf-choice-cancel,
    .patient-report-pdf-choice-confirm {
      border-radius: 10px;
      padding: .76rem 1.05rem;
      font-weight: 700;
      cursor: pointer;
      min-height: 46px;
      box-sizing: border-box;
    }
    .patient-report-pdf-choice-cancel {
      border: 1px solid #d3dfdf;
      background: #ffffff;
      color: #2a4748;
      font-weight: 600;
    }
    .patient-report-pdf-choice-confirm {
      border: none;
      background: #00838d;
      color: #ffffff;
      box-shadow: 0 12px 24px rgba(0,131,141,0.18);
    }
    .patient-report-pdf-choice-confirm:disabled {
      cursor: not-allowed;
      background: #9bbdbe;
      box-shadow: none;
    }
    @media (max-width: 640px) {
      #patientReportPdfChoiceBackdrop.patient-report-pdf-choice-backdrop {
        align-items: flex-start;
        padding: 10px;
      }
      .patient-report-pdf-choice-dialog {
        width: 100%;
        max-width: 100%;
        max-height: calc(100vh - 20px);
        max-height: calc(100dvh - 20px);
        border-radius: 14px;
      }
      .patient-report-pdf-choice-header {
        gap: 10px;
        padding: 14px 14px 0;
      }
      .patient-report-pdf-choice-title {
        font-size: 1rem;
      }
      .patient-report-pdf-choice-description {
        font-size: .87rem;
        line-height: 1.38;
      }
      .patient-report-pdf-choice-body {
        padding: 10px 14px 0;
      }
      .patient-report-pdf-choice {
        grid-template-columns: minmax(0, 1fr) auto;
        column-gap: 10px;
        padding: 10px 0;
      }
      .patient-report-pdf-choice-option-title {
        font-size: .95rem;
      }
      .patient-report-pdf-choice-option-description {
        font-size: .84rem;
        line-height: 1.35;
      }
      .patient-report-pdf-choice-footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
        padding: 14px;
        gap: 10px;
      }
      .patient-report-pdf-choice-cancel,
      .patient-report-pdf-choice-confirm {
        width: 100%;
        padding: .74rem .9rem;
      }
    }
    @media (max-width: 400px) {
      .patient-report-pdf-choice-footer {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function patientReportOpenPdfChoiceDialog(triggerBtn) {
  if (__patientReportPdfInFlight) return;
  const options = patientReportGetPdfChoiceOptions();
  if (!options.length) {
    patientReportShowToast('Brak dostępnych raportów PDF do wygenerowania.');
    return;
  }

  patientReportRemovePdfChoiceDialog();
  patientReportEnsurePdfChoiceDialogStyles();

  const backdrop = document.createElement('div');
  backdrop.id = 'patientReportPdfChoiceBackdrop';
  backdrop.className = 'patient-report-pdf-choice-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'patient-report-pdf-choice-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'patientReportPdfChoiceTitle');
  vildaAppSetTrustedHtml(dialog, `
    <div class="patient-report-pdf-choice-header">
      <div class="patient-report-pdf-choice-header-copy">
        <h3 id="patientReportPdfChoiceTitle" class="patient-report-pdf-choice-title">Wybierz części raportu PDF</h3>
        <p class="patient-report-pdf-choice-description">Włącz jedną lub kilka części, które mają znaleźć się w jednym pliku PDF. Kolejność stron pozostanie stała: raport po wizycie, raport zaleceń dietetycznych, siatka centylowa, raport wzrastania.</p>
      </div>
      <button type="button" data-patient-report-pdf-choice-close aria-label="Zamknij" class="patient-report-pdf-choice-close">×</button>
    </div>
    <div class="patient-report-pdf-choice-body">
      <form id="patientReportPdfChoiceForm" class="patient-report-pdf-choice-form" role="group" aria-labelledby="patientReportPdfChoiceTitle">
        ${options.map((option) => `
          <label class="patient-report-pdf-choice${option.checkedByDefault ? ' is-selected' : ''}">
            <span class="patient-report-pdf-choice-copy">
              <span class="patient-report-pdf-choice-option-title">${patientReportEscapeHtml(option.title)}</span>
              <span class="patient-report-pdf-choice-option-description">${patientReportEscapeHtml(option.description)}</span>
            </span>
            <span class="patient-report-pdf-choice-toggle-wrap">
              <span class="switch-diet patient-report-pdf-choice-toggle">
                <input type="checkbox" name="patientReportPdfChoice" value="${patientReportEscapeHtml(option.value)}" ${option.checkedByDefault ? 'checked' : ''} />
                <span class="slider"></span>
              </span>
            </span>
          </label>
        `).join('')}
      </form>
    </div>
    <div class="patient-report-pdf-choice-footer">
      <button type="button" data-patient-report-pdf-choice-cancel class="patient-report-pdf-choice-cancel">Anuluj</button>
      <button type="button" data-patient-report-pdf-choice-confirm class="patient-report-pdf-choice-confirm">Generuj PDF</button>
    </div>
  `, 'app:dialog');

  const previousBodyOverflow = document.body ? document.body.style.overflow : '';
  const previousHtmlOverflow = document.documentElement ? document.documentElement.style.overflow : '';
  backdrop.dataset.prevBodyOverflow = previousBodyOverflow;
  backdrop.dataset.prevHtmlOverflow = previousHtmlOverflow;
  if (document.body) document.body.style.overflow = 'hidden';
  if (document.documentElement) document.documentElement.style.overflow = 'hidden';

  const cleanup = () => {
    try { document.removeEventListener('keydown', onKeyDown); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18381 });
    }
  }
    if (document.body) document.body.style.overflow = previousBodyOverflow;
    if (document.documentElement) document.documentElement.style.overflow = previousHtmlOverflow;
    patientReportRemovePdfChoiceDialog();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') cleanup();
  };

  const runSelectedOptions = async () => {
    const checkedValues = Array.from(dialog.querySelectorAll('input[name="patientReportPdfChoice"]:checked')).map((input) => input.value);
    const selected = options.map((option) => option.value).filter((value) => checkedValues.includes(value));
    if (!selected.length) {
      patientReportShowToast('Wybierz co najmniej jedną część raportu PDF.');
      patientReportRefreshPdfChoiceSelection(backdrop);
      return;
    }
    cleanup();
    await generatePatientSelectedPdfPackage(triggerBtn, selected);
  };

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) cleanup();
  });
  dialog.querySelector('[data-patient-report-pdf-choice-close]')?.addEventListener('click', cleanup);
  dialog.querySelector('[data-patient-report-pdf-choice-cancel]')?.addEventListener('click', cleanup);
  dialog.querySelector('[data-patient-report-pdf-choice-confirm]')?.addEventListener('click', () => {
    runSelectedOptions();
  });

  dialog.querySelectorAll('input[name="patientReportPdfChoice"]').forEach((input) => {
    input.addEventListener('change', () => patientReportRefreshPdfChoiceSelection(backdrop));
  });

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onKeyDown);
  patientReportRefreshPdfChoiceSelection(backdrop);

  requestAnimationFrame(() => {
    try {
      dialog.querySelector('input[name="patientReportPdfChoice"]:checked')?.focus({ preventScroll: true });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 18424 });
    }
  }
  });
}

(function setupPatientReportPdfButton() {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', function(event) {
    const btn = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-patient-report-pdf-btn]')
      : null;
    if (!btn) return;
    event.preventDefault();
    patientReportOpenPdfChoiceDialog(btn);
  });
})();

(function installVildaPatientReportApi(global) {
  if (!global) return;
  const VERSION = '1.0.0';
  const exportedFunctions = {
    updateProfessionalSummaryCard,
    getFormattedProfessionalSummaryLines,
    attachPatientReportActionToSummaryCard,
    generatePatientReportPdf,
    generatePatientCentileChartPdf,
    generatePatientAdvancedGrowthPdf,
    generatePatientSelectedPdfPackage,
    patientReportOpenPdfChoiceDialog,
    patientReportBuildModel,
    patientReportBuildHtml,
    patientReportBuildPdfPackage,
    patientReportGetPdfChoiceOptions
  };
  try {
    Object.keys(exportedFunctions).forEach((name) => {
      if (typeof exportedFunctions[name] === 'function') {
        global[name] = exportedFunctions[name];
      }
    });
  } catch (error) {
    if (typeof global.vildaLogSwallowedCatch === 'function') {
      global.vildaLogSwallowedCatch('vilda_patient_report.js', error, { context: 'export-functions' });
    }
  }
  const call = (name) => function vildaPatientReportApiCall() {
    const fn = global[name];
    if (typeof fn !== 'function') return undefined;
    return fn.apply(this, arguments);
  };
  const api = {
    __vildaPatientReport: true,
    VERSION,
    version: VERSION,
    versionInfo() {
      return {
        version: VERSION,
        module: 'vilda_patient_report.js',
        extractedFrom: 'app.js',
        step: '8H'
      };
    },
    updateProfessionalSummaryCard: call('updateProfessionalSummaryCard'),
    getFormattedProfessionalSummaryLines: call('getFormattedProfessionalSummaryLines'),
    attachPatientReportActionToSummaryCard: call('attachPatientReportActionToSummaryCard'),
    generatePatientReportPdf: call('generatePatientReportPdf'),
    generatePatientCentileChartPdf: call('generatePatientCentileChartPdf'),
    generatePatientAdvancedGrowthPdf: call('generatePatientAdvancedGrowthPdf'),
    generatePatientSelectedPdfPackage: call('generatePatientSelectedPdfPackage'),
    patientReportOpenPdfChoiceDialog: call('patientReportOpenPdfChoiceDialog'),
    patientReportBuildModel: call('patientReportBuildModel'),
    patientReportBuildHtml: call('patientReportBuildHtml'),
    patientReportBuildPdfPackage: call('patientReportBuildPdfPackage'),
    patientReportGetPdfChoiceOptions: call('patientReportGetPdfChoiceOptions')
  };
  try {
    global.VildaPatientReport = api;
    global.vildaPatientReport = api;
    global.vildaPatientReportVersion = function vildaPatientReportVersion() { return VERSION; };
  } catch (error) {
    if (typeof global.vildaLogSwallowedCatch === 'function') {
      global.vildaLogSwallowedCatch('vilda_patient_report.js', error, { context: 'install-api' });
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
