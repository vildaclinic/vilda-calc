(function (global) {
  'use strict';
  if (!global || global.vildaDiabetesPersistence) return;

  function getPersistence(){
    try { return global.VildaPersistence || null; } catch (_) { return null; }
  }

  function readJSON(alias, fallback){
    try {
      const persistence = getPersistence();
      if (persistence && typeof persistence.readModuleJSON === 'function') {
        return persistence.readModuleJSON(alias, fallback == null ? null : fallback);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('cukrzyca.js', _, { line: 15 });
    }
  }
    return fallback == null ? null : fallback;
  }

  function writeJSON(alias, value){
    try {
      const persistence = getPersistence();
      if (persistence && typeof persistence.writeModuleJSON === 'function') {
        return persistence.writeModuleJSON(alias, value, { force: true });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('cukrzyca.js', _, { line: 25 });
    }
  }
    return false;
  }

  function removeKey(alias){
    try {
      const persistence = getPersistence();
      if (persistence && typeof persistence.removeModuleKey === 'function') {
        return persistence.removeModuleKey(alias);
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('cukrzyca.js', _, { line: 35 });
    }
  }
    return false;
  }

  function clearAll(source){
    try {
      const persistence = getPersistence();
      if (persistence && typeof persistence.clearModuleState === 'function') {
        return persistence.clearModuleState({
          scope: 'diabetes',
          includePreferences: false,
          source: source || 'cukrzyca.clearAll',
          dispatchEvent: true
        });
      }
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('cukrzyca.js', _, { line: 50 });
    }
  }
    const removed = [
      removeKey('DIABETES_MEAL_RATIOS'),
      removeKey('DIABETES_MACRO_BT_DRAFT'),
      removeKey('DIABETES_DOSE_SETTINGS'),
      removeKey('DIABETES_DOSE_SETTINGS_LEGACY')
    ];
    return { ok: removed.every(Boolean), removedKeys: [], failedKeys: [] };
  }

  global.vildaDiabetesPersistence = {
    readJSON,
    writeJSON,
    removeKey,
    clearAll
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

function diabLogWarn(message, error, meta) {
  try {
    if (typeof window !== 'undefined' && window.VildaLogger && typeof window.VildaLogger.warn === 'function') {
      window.VildaLogger.warn('cukrzyca', message || 'Ostrzeżenie renderowania modułu cukrzycy.', error || null, meta || {});
      return true;
    }
  } catch (loggingError) {
    if (typeof window !== 'undefined' && window.__VILDA_DEBUG === true && window.console && typeof window.console.warn === 'function') {
      window.console.warn('[cukrzyca] Nie udało się zapisać ostrzeżenia diagnostycznego.', loggingError);
    }
  }
  return false;
}

function diabSetTrustedHtml(element, html, context) {
  if (!element) return false;
  try {
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.setTrustedHtml === 'function') {
      return window.VildaHtml.setTrustedHtml(element, html == null ? '' : html, { context: context || 'cukrzyca:trusted-markup' });
    }
    element.textContent = String(html == null ? '' : html);
    return true;
  } catch (error) {
    diabLogWarn('Nie udało się wstawić kontrolowanego HTML.', error, { context: context || '' });
    return false;
  }
}

function diabClearHtml(element) {
  if (!element) return false;
  try {
    if (typeof window !== 'undefined' && window.VildaHtml) {
      if (typeof window.VildaHtml.clear === 'function') return window.VildaHtml.clear(element);
      if (typeof window.VildaHtml.clearHtml === 'function') return window.VildaHtml.clearHtml(element);
    }
    element.textContent = '';
    return true;
  } catch (error) {
    diabLogWarn('Nie udało się wyczyścić elementu.', error);
    return false;
  }
}

(function () {
  'use strict';

  const STABLE_THRESHOLD_DEFAULT = 30;
  const RATIO_TOLERANCE = 0.15;
  const PRACTICAL_SENSITIVITY_STEP = 5;

  const EXERCISE_MODIFIERS = {
    none: { key: 'none', label: 'Brak planowanego wysiłku', percent: 0, factor: 1 },
    planned25: { key: 'planned25', label: 'Planowany lekki wysiłek', percent: -25, factor: 0.75 },
    planned50: { key: 'planned50', label: 'Planowany umiarkowany wysiłek', percent: -50, factor: 0.5 },
    planned75: { key: 'planned75', label: 'Planowany długi / intensywny wysiłek', percent: -75, factor: 0.25 }
  };

  const INFECTION_MODIFIERS = {
    none: { key: 'none', label: 'Brak infekcji z gorączką', percent: 0, factor: 1 },
    fever25: { key: 'fever25', label: 'Infekcja z gorączką – wariant +25%', percent: 25, factor: 1.25 },
    fever50: { key: 'fever50', label: 'Infekcja z gorączką – wariant +50%', percent: 50, factor: 1.5 }
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function parseLocaleNumber(value) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
    return normalized === '' ? NaN : Number(normalized);
  }

  function roundToStep(value, step) {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    return Math.round(value / step) * step;
  }

  function roundToNearestFiveHalfDown(value) {
    if (!Number.isFinite(value)) return NaN;
    const step = PRACTICAL_SENSITIVITY_STEP;
    const lower = Math.floor(value / step) * step;
    const remainder = value - lower;
    const rounded = remainder <= step / 2 ? lower : lower + step;
    return Math.max(step, rounded);
  }

  function shuffleArray(items) {
    const array = items.slice();
    for (let index = array.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
    }
    return array;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits
    }).format(value);
  }

  function formatSignedPercent(value) {
    if (!Number.isFinite(value) || value === 0) return '0%';
    return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value), 0)}%`;
  }

  function getRatioDisplayPair(result) {
    const exactText = formatNumber(result && result.ratioExact, 2);
    const roundedText = formatNumber(result && result.ratioRounded, 0);
    return {
      exactText,
      roundedText,
      same: exactText === roundedText,
      exactHtml: `<strong>${exactText} g/j</strong>`,
      roundedHtml: `<strong>${roundedText} g/j</strong>`
    };
  }

  function buildCorrectRatioFragment(result) {
    const pair = getRatioDisplayPair(result);
    if (pair.same) {
      return pair.exactHtml;
    }
    return `${pair.exactHtml}, a praktycznie po zaokrągleniu ${pair.roundedHtml}`;
  }


  function needsTrailingPeriod(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    return !/[.!?…]$/.test(trimmed);
  }

  function normalizeLeadingPunctuation(text) {
    return String(text || '').replace(/^\s*[.]+/, '').trim();
  }

  function formatCorrectAnswerShort(item) {
    const correctText = String(item.question && item.question.correctText ? item.question.correctText : '').trim();
    const dot = needsTrailingPeriod(correctText) ? '.' : '';
    return `Poprawna odpowiedź w ${escapeHtml(item.question.feedbackLabel)}: <strong>${escapeHtml(correctText)}</strong>${dot}`;
  }

  function formatCorrectAnswerWithExplanation(item) {
    const correctText = String(item.question && item.question.correctText ? item.question.correctText : '').trim();
    const dot = needsTrailingPeriod(correctText) ? '.' : '';
    const explanation = normalizeLeadingPunctuation(item.question && item.question.explanation ? item.question.explanation : '');
    return `Poprawna odpowiedź w ${escapeHtml(item.question.feedbackLabel)}: <strong>${escapeHtml(correctText)}</strong>${dot}${explanation ? ' ' + escapeHtml(explanation) : ''}`;
  }

  function classifyDelta(delta, threshold) {
    if (Math.abs(delta) <= threshold) return 'stable';
    return delta > 0 ? 'tooLittle' : 'tooMuch';
  }

  function getExerciseModifier(value) {
    return EXERCISE_MODIFIERS[value] || EXERCISE_MODIFIERS.none;
  }

  function getInfectionModifier(value) {
    return INFECTION_MODIFIERS[value] || INFECTION_MODIFIERS.none;
  }

  function buildAdvisories(data) {
    const advisories = [];

    if (data.proMode && data.stressMode === 'present') {
      advisories.push({
        key: 'stress',
        title: 'Stres',
        shortLabel: 'Stres - uwaga interpretacyjna',
        text: 'Stres może podnosić glikemię i zmniejszać wrażliwość na insulinę, ale nie da się go bezpiecznie przeliczyć jednym stałym procentem. Dlatego w tym ćwiczeniu traktujemy stres jako uwagę interpretacyjną — bez automatycznej zmiany liczby g/j.'
      });
    }

    if (data.proMode && data.fatProteinMode === 'high') {
      advisories.push({
        key: 'fatProtein',
        title: 'Bardzo duża zawartość białka i tłuszczu',
        shortLabel: 'Białko i tłuszcz >200 kcal - uwaga interpretacyjna',
        text: 'Jeśli posiłek zawiera >200 kcal z białka i tłuszczu, może pojawić się późniejszy wzrost glikemii (np. 2–4 h po posiłku) i czasem potrzebna jest dodatkowa korekta. W tym ćwiczeniu traktujemy to jako ważną uwagę interpretacyjną — bez automatycznej zmiany przelicznika g/j.'
      });
    }

    return advisories;
  }

  function hasAdvisory(result, key) {
    return Boolean(
      result &&
      result.pro &&
      Array.isArray(result.pro.advisories) &&
      result.pro.advisories.some((item) => item.key === key)
    );
  }

  function buildProQuestion(definition) {
    const correctOption = definition.options.find((option) => option.correct);

    return {
      key: definition.key,
      title: definition.title,
      prompt: definition.prompt,
      help: definition.help,
      shortLabel: definition.shortLabel,
      feedbackLabel: definition.feedbackLabel,
      explanation: definition.explanation,
      correctOptionKey: correctOption ? correctOption.key : '',
      correctText: correctOption ? correctOption.text : '',
      options: shuffleArray(definition.options.map((option) => Object.assign({}, option)))
    };
  }

  function getStressQuestionDefinition() {
    return {
      key: 'stress',
      title: 'Pytanie PRO - stres',
      prompt: 'Pytanie PRO - stres: która odpowiedź najlepiej opisuje ten modyfikator?',
      help: 'Zaznacz jedną odpowiedź dotyczącą stresu.',
      shortLabel: 'stres',
      feedbackLabel: 'pytaniu o stres',
      explanation: 'Stres może zwiększać glikemię i zwykle zmniejsza wrażliwość na insulinę, ale nie ma jednego stałego procentu, który pasuje do każdego przypadku. Dlatego w tym ćwiczeniu nie przeliczamy g/j automatycznie — to jest uwaga interpretacyjna.',
      options: [
        {
          key: 'stress_correct',
          text: 'Stres może zwiększać glikemię i zmniejszać wrażliwość na insulinę, ale tu nie ma jednego stałego procentu do zmiany g/j.',
          correct: true
        },
        {
          key: 'stress_always_down',
          text: 'Stres zawsze obniża glikemię, więc trzeba automatycznie odjąć insulinę do posiłku.',
          correct: false
        },
        {
          key: 'stress_no_effect',
          text: 'Stres nie wpływa ani na glikemię, ani na działanie insuliny, więc można go całkowicie pominąć.',
          correct: false
        },
        {
          key: 'stress_like_exercise',
          text: 'Stres liczymy tak samo jak planowany wysiłek: zmniejszamy dawkę do posiłku o 25-75%.',
          correct: false
        },
        {
          key: 'stress_extra_carbs',
          text: 'Stres oznacza, że przed posiłkiem zawsze trzeba zjeść dodatkowe węglowodany bez insuliny.',
          correct: false
        }
      ]
    };
  }

  function getFatProteinQuestionDefinition() {
    return {
      key: 'fatProtein',
      title: 'Pytanie PRO - bardzo duża zawartość białka i tłuszczu',
      prompt: 'Pytanie PRO - białko i tłuszcz: która odpowiedź najlepiej opisuje ten modyfikator?',
      help: 'Zaznacz jedną odpowiedź dotyczącą bardzo dużej zawartości białka i tłuszczu.',
      shortLabel: 'białko i tłuszcz',
      feedbackLabel: 'pytaniu o białko i tłuszcz',
      explanation: 'Jeśli posiłek ma >200 kcal z białka i tłuszczu, może pojawić się późniejszy wzrost glikemii 2-4 h po posiłku i czasem potrzebna jest dodatkowa korekta.',
      options: [
        {
          key: 'fatProtein_correct',
          text: 'Jeśli posiłek ma >200 kcal z białka i tłuszczu, może dać późniejszy wzrost glikemii 2-4 h po posiłku i czasem wymagać korekty.',
          correct: true
        },
        {
          key: 'fatProtein_never_matters',
          text: 'Duża ilość białka i tłuszczu nigdy nie ma znaczenia w insulinoterapii, więc nie trzeba o niej myśleć.',
          correct: false
        },
        {
          key: 'fatProtein_reduce_75',
          text: 'Duża ilość białka i tłuszczu zawsze oznacza, że trzeba od razu zmniejszyć insulinę do posiłku o 75%.',
          correct: false
        },
        {
          key: 'fatProtein_only_no_carbs',
          text: 'Białko i tłuszcz liczymy tylko wtedy, gdy w posiłku nie ma żadnych węglowodanów.',
          correct: false
        },
        {
          key: 'fatProtein_immediate_drop',
          text: 'Duża ilość białka i tłuszczu powoduje tylko szybki spadek glikemii zaraz po posiłku.',
          correct: false
        }
      ]
    };
  }

  function buildProQuestions(advisories) {
    const questions = [];
    const advisoryKeys = Array.isArray(advisories) ? advisories.map((item) => item.key) : [];

    if (advisoryKeys.includes('stress')) {
      questions.push(buildProQuestion(getStressQuestionDefinition()));
    }

    if (advisoryKeys.includes('fatProtein')) {
      questions.push(buildProQuestion(getFatProteinQuestionDefinition()));
    }

    return questions;
  }

  function getActiveProQuestions(result) {
    if (!result || !result.proMode || !result.pro || !Array.isArray(result.pro.questions)) {
      return [];
    }
    return result.pro.questions;
  }

  function computeBaseScenario(data) {
    const threshold = Number.isFinite(data.threshold) ? data.threshold : STABLE_THRESHOLD_DEFAULT;
    const sensitivityExact = 1800 / data.ddi;
    const sensitivityPractical = roundToNearestFiveHalfDown(sensitivityExact);
    const delta = data.glucoseAfter - data.glucoseBefore;
    const deltaAbs = Math.abs(delta);
    const scenarioType = classifyDelta(delta, threshold);

    let adjustmentRaw = 0;
    let adjustmentRounded = 0;
    let baseMealInsulin = data.insulinDose;

    let strictAdjustmentRounded = 0;
    let strictBaseMealInsulin = data.insulinDose;

    if (scenarioType === 'tooLittle') {
      adjustmentRaw = deltaAbs / sensitivityPractical;
      adjustmentRounded = roundToStep(adjustmentRaw, 0.5);
      baseMealInsulin = data.insulinDose + adjustmentRounded;

      strictAdjustmentRounded = roundToStep(deltaAbs / sensitivityExact, 0.5);
      strictBaseMealInsulin = data.insulinDose + strictAdjustmentRounded;
    } else if (scenarioType === 'tooMuch') {
      adjustmentRaw = deltaAbs / sensitivityPractical;
      adjustmentRounded = roundToStep(adjustmentRaw, 0.5);
      baseMealInsulin = data.insulinDose - adjustmentRounded;

      strictAdjustmentRounded = roundToStep(deltaAbs / sensitivityExact, 0.5);
      strictBaseMealInsulin = data.insulinDose - strictAdjustmentRounded;
    }

    if (!Number.isFinite(baseMealInsulin) || baseMealInsulin <= 0) {
      return {
        ok: false,
        message: 'Te parametry tworzą nielogiczne zadanie: po odjęciu nadmiarowej insuliny dawka „na posiłek” wychodzi równa 0 j lub ujemna. Zmień założenia.'
      };
    }

    const baseRatioExact = data.carbs / baseMealInsulin;
    const baseRatioRounded = Math.max(1, Math.round(baseRatioExact));

    let strictBaseRatioExact = NaN;
    let strictBaseRatioRounded = NaN;
    if (Number.isFinite(strictBaseMealInsulin) && strictBaseMealInsulin > 0) {
      strictBaseRatioExact = data.carbs / strictBaseMealInsulin;
      strictBaseRatioRounded = Math.max(1, Math.round(strictBaseRatioExact));
    }

    return {
      ok: true,
      threshold,
      sensitivityExact,
      sensitivityPractical,
      delta,
      scenarioType,
      adjustmentRaw,
      adjustmentRounded,
      strictAdjustmentRounded,
      baseMealInsulin,
      strictBaseMealInsulin,
      baseRatioExact,
      baseRatioRounded,
      strictBaseRatioExact,
      strictBaseRatioRounded,
      bolusDose: data.insulinDose,
      carbs: data.carbs,
      glucoseBefore: data.glucoseBefore,
      glucoseAfter: data.glucoseAfter,
      ddi: data.ddi,
      mealType: data.mealType
    };
  }

  function applyProModifiers(base, data) {
    const exercise = getExerciseModifier(data.exerciseMode);
    const infection = getInfectionModifier(data.infectionMode);
    const advisories = buildAdvisories(data);

    if (!data.proMode) {
      return {
        ok: true,
        active: false,
        exercise: EXERCISE_MODIFIERS.none,
        infection: INFECTION_MODIFIERS.none,
        advisories: [],
        questions: [],
        numericSteps: [],
        finalMealInsulin: base.baseMealInsulin,
        strictFinalMealInsulin: base.strictBaseMealInsulin
      };
    }

    let finalMealInsulin = base.baseMealInsulin;
    let strictFinalMealInsulin = base.strictBaseMealInsulin;
    const numericSteps = [];

    function pushNumericStep(type, modifier, note) {
      const from = finalMealInsulin;
      const strictFrom = strictFinalMealInsulin;

      finalMealInsulin = finalMealInsulin * modifier.factor;
      if (Number.isFinite(strictFinalMealInsulin)) {
        strictFinalMealInsulin = strictFinalMealInsulin * modifier.factor;
      }

      numericSteps.push({
        type,
        label: modifier.label,
        percent: modifier.percent,
        factor: modifier.factor,
        from,
        to: finalMealInsulin,
        strictFrom,
        strictTo: strictFinalMealInsulin,
        note
      });
    }

    if (infection.percent !== 0) {
      pushNumericStep(
        'infection',
        infection,
        'Infekcja z gorączką zwykle zwiększa zapotrzebowanie na insulinę (w tym zadaniu: +25% lub +50%), więc do podobnej ilości węglowodanów potrzeba więcej insuliny.'
      );
    }

    if (exercise.percent !== 0) {
      pushNumericStep(
        'exercise',
        exercise,
        'Planowany wysiłek zwykle zwiększa wrażliwość na insulinę (w tym zadaniu: −25%, −50% lub −75%), więc na podobny posiłek potrzeba mniej insuliny.'
      );
    }

    if (!Number.isFinite(finalMealInsulin) || finalMealInsulin <= 0) {
      return {
        ok: false,
        message: 'Po uwzględnieniu modyfikatorów PRO dawka potrzebna na posiłek wychodzi równa 0 j lub ujemna. Zmień ustawienia zadania.'
      };
    }

    if (!Number.isFinite(strictFinalMealInsulin) || strictFinalMealInsulin <= 0) {
      strictFinalMealInsulin = NaN;
    }

    return {
      ok: true,
      active: numericSteps.length > 0 || advisories.length > 0,
      exercise,
      infection,
      advisories,
      questions: buildProQuestions(advisories),
      numericSteps,
      finalMealInsulin,
      strictFinalMealInsulin
    };
  }

  function computeScenario(data) {
    const base = computeBaseScenario(data);
    if (!base.ok) return base;

    const pro = applyProModifiers(base, data);
    if (!pro.ok) {
      return {
        ok: false,
        message: pro.message
      };
    }

    const mealInsulin = pro.finalMealInsulin;
    const strictMealInsulin = pro.strictFinalMealInsulin;
    const ratioExact = data.carbs / mealInsulin;
    const ratioRounded = Math.max(1, Math.round(ratioExact));

    let strictRatioExact = NaN;
    let strictRatioRounded = NaN;
    if (Number.isFinite(strictMealInsulin) && strictMealInsulin > 0) {
      strictRatioExact = data.carbs / strictMealInsulin;
      strictRatioRounded = Math.max(1, Math.round(strictRatioExact));
    }

    const acceptedAnswers = Array.from(new Set([
      ratioRounded,
      Number.isFinite(strictRatioRounded) ? strictRatioRounded : null
    ].filter((value) => Number.isFinite(value))));

    return Object.assign({}, base, {
      proMode: Boolean(data.proMode),
      proActive: pro.active,
      pro,
      mealInsulin,
      strictMealInsulin,
      ratioExact,
      ratioRounded,
      strictRatioExact,
      strictRatioRounded,
      acceptedAnswers
    });
  }

  function getScenarioLabel(type) {
    switch (type) {
      case 'stable':
        return 'stabilna glikemia';
      case 'tooLittle':
        return 'za mało insuliny';
      case 'tooMuch':
        return 'za dużo insuliny / część dawki poszła na korektę';
      default:
        return 'analiza posiłku';
    }
  }

  function getScenarioBadgeClass(type) {
    switch (type) {
      case 'stable':
        return 'diab-badge diab-badge--ok';
      case 'tooLittle':
        return 'diab-badge diab-badge--warn';
      case 'tooMuch':
        return 'diab-badge diab-badge--danger';
      default:
        return 'diab-badge';
    }
  }

  function getActiveProQuestionCount(result) {
    return getActiveProQuestions(result).length;
  }

  function getProTaskLead(result) {
    const questionCount = getActiveProQuestionCount(result);

    if (questionCount === 0) {
      return 'Korzystając z <strong>zasady L</strong>, oblicz przelicznik doposiłkowy dla tego posiłku <strong>na podstawie danych z dnia poprzedniego</strong>. Końcowy wynik potraktuj jako przelicznik do odpowiedniego posiłku <strong>bieżącego dnia</strong>.';
    }

    if (questionCount === 1) {
      return 'Korzystając z <strong>zasady L</strong>, oblicz przelicznik doposiłkowy dla tego posiłku <strong>na podstawie danych z dnia poprzedniego</strong>, a następnie zaznacz poprawną odpowiedź w dodatkowym pytaniu klinicznym. Wyliczony wynik ma służyć do odpowiedniego posiłku <strong>bieżącego dnia</strong>.';
    }

    return 'Korzystając z <strong>zasady L</strong>, oblicz przelicznik doposiłkowy dla tego posiłku <strong>na podstawie danych z dnia poprzedniego</strong>, a następnie zaznacz poprawne odpowiedzi w dwóch dodatkowych pytaniach klinicznych. Wyliczony wynik ma służyć do odpowiedniego posiłku <strong>bieżącego dnia</strong>.';
  }

  function getProTaskAnswerInstruction(result) {
    const questionCount = getActiveProQuestionCount(result);

    if (questionCount === 0) {
      return 'Na końcu podaj tylko wynik g/j.';
    }

    if (questionCount === 1) {
      return 'Na końcu odpowiedz w dwóch miejscach: wpisz wynik g/j i zaznacz jedną poprawną odpowiedź PRO.';
    }

    return 'Na końcu odpowiedz w trzech miejscach: wpisz wynik g/j oraz zaznacz osobno po jednej poprawnej odpowiedzi w pytaniu o stres i w pytaniu o białko i tłuszcz.';
  }

  function getProTaskNote(result) {
    return `Najpierw policz insulinowrażliwość ze wzoru <strong>1800/DDI</strong>. Pamiętaj, że analizujesz <strong>posiłek z dnia poprzedniego</strong>, a końcowy wynik przenosisz na <strong>taki sam posiłek bieżącego dnia</strong>. W tym ćwiczeniu do dalszych kroków możesz przyjąć wartość praktyczną zaokrągloną do około <strong>5 mg/dl</strong>. Następnie policz insulinę potrzebną na posiłek z zasady L. Jeśli widzisz fioletowe modyfikatory liczbowe, zastosuj je po ustaleniu insuliny potrzebnej na posiłek. ${getProTaskAnswerInstruction(result)}`;
  }

  function getScenarioNarrative(result) {
    if (result.scenarioType === 'stable') {
      return `Różnica między glikemią przed posiłkiem i po posiłku wynosi ${formatNumber(Math.abs(result.delta), 0)} mg/dl, czyli mieści się w przyjętym progu ±${formatNumber(result.threshold, 0)} mg/dl. To oznacza, że dawka ${formatNumber(result.bolusDose, 1)} j dobrze pokryła posiłek.`;
    }
    if (result.scenarioType === 'tooLittle') {
      return `Glikemia po posiłku wzrosła o ${formatNumber(result.delta, 0)} mg/dl, czyli za bardzo. To znaczy, że insuliny było za mało w stosunku do ilości węglowodanów.`;
    }
    return `Glikemia po posiłku spadła o ${formatNumber(Math.abs(result.delta), 0)} mg/dl, czyli zbyt mocno. To znaczy, że część podanej insuliny była nadmiarem względem posiłku.`;
  }

  function buildMetrics(result) {
    const items = [
      { label: 'Próg „stabilnej” różnicy glikemii', value: `±${formatNumber(result.threshold, 0)} mg/dl` },
      { label: 'DDI z poprzedniego dnia', value: `${formatNumber(result.ddi, 1)} j` },
      { label: 'Glikemia przed posiłkiem', value: `${formatNumber(result.glucoseBefore, 0)} mg/dl` },
      { label: 'Węglowodany w posiłku', value: `${formatNumber(result.carbs, 1)} g` },
      { label: 'Podana insulina', value: `${formatNumber(result.bolusDose, 1)} j` },
      { label: 'Glikemia 2–3 h po posiłku', value: `${formatNumber(result.glucoseAfter, 0)} mg/dl` }
    ];

    if (result.proMode) {
      if (result.proActive) {
        items.push({ label: 'Tryb zadania', value: 'PRO' });
      }
      if (result.pro.infection.percent !== 0) {
        items.push({
          label: 'Infekcja z gorączką',
          value: `${result.pro.infection.label} (${formatSignedPercent(result.pro.infection.percent)} insuliny do posiłku)`
        });
      }
      if (result.pro.exercise.percent !== 0) {
        items.push({
          label: 'Wysiłek planowany',
          value: `${result.pro.exercise.label} (${formatSignedPercent(result.pro.exercise.percent)} insuliny do posiłku)`
        });
      }
      result.pro.advisories.forEach((item) => {
        items.push({
          label: item.title,
          value: item.shortLabel
        });
      });
    }

    return items;
  }

  function renderMetrics(result, container) {
    diabSetTrustedHtml(container, buildMetrics(result)
      .map((item) => `
        <div class="diab-metric">
          <span class="diab-metric__label">${escapeHtml(item.label)}</span>
          <strong class="diab-metric__value">${escapeHtml(item.value)}</strong>
        </div>
      `)
      .join(''), 'task metrics');
  }

  function buildProTaskInfo(result) {
    if (!result || !result.proMode || !result.pro) return '';

    const hasNumericSteps = Array.isArray(result.pro.numericSteps) && result.pro.numericSteps.length > 0;
    const hasAdvisories = Array.isArray(result.pro.advisories) && result.pro.advisories.length > 0;
    const questionCount = getActiveProQuestionCount(result);

    // Jeśli PRO jest włączone, ale w zadaniu nie ustawiono żadnych modyfikatorów/uwag,
    // to nie pokazujemy w ogóle tego bloku (żeby nie mieszać pacjentowi).
    if (!hasNumericSteps && !hasAdvisories && questionCount === 0) {
      return '';
    }

    const chips = [];

    if (result.pro.infection && result.pro.infection.percent !== 0) {
      chips.push(`<span class="diab-pro-chip">Infekcja ${formatSignedPercent(result.pro.infection.percent)} insuliny</span>`);
    }

    if (result.pro.exercise && result.pro.exercise.percent !== 0) {
      chips.push(`<span class="diab-pro-chip">Wysiłek ${formatSignedPercent(result.pro.exercise.percent)} insuliny</span>`);
    }

    if (hasAdvisories) {
      result.pro.advisories.forEach((item) => {
        chips.push(`<span class="diab-pro-chip diab-pro-chip--note">${escapeHtml(item.shortLabel)}</span>`);
      });
    }

    const notes = [];

    if (hasNumericSteps) {
      const numericLabels = [];
      if (result.pro.infection && result.pro.infection.percent !== 0) numericLabels.push('infekcję z gorączką');
      if (result.pro.exercise && result.pro.exercise.percent !== 0) numericLabels.push('planowany wysiłek');

      if (numericLabels.length) {
        notes.push(`Po obliczeniu insuliny potrzebnej na posiłek uwzględnij jeszcze ${numericLabels.join(' oraz ')} oznaczone na fioletowo.`);
      }
    }

    if (hasAdvisories) {
      notes.push('Stres i bardzo duża zawartość białka i tłuszczu pokazujemy tu jako ważne uwagi kliniczne, ale bez automatycznej zmiany liczby g/j.');
    }

    if (questionCount === 0) {
      notes.push('W odpowiedzi wpisz liczbę g/j.');
    } else if (questionCount === 1) {
      notes.push('W odpowiedzi wpisz liczbę g/j i zaznacz poprawną odpowiedź w aktywnym pytaniu PRO.');
    } else {
      notes.push('W odpowiedzi wpisz liczbę g/j i zaznacz poprawne odpowiedzi osobno w pytaniu o stres oraz w pytaniu o białko i tłuszcz.');
    }

    return `
      <strong>Tryb profesjonalny<sup class="pro-superscript">PRO</sup></strong>
      <p style="margin:0.35rem 0 0;">${notes.join(' ')}</p>
      ${chips.length ? `<div class="diab-pro-chips">${chips.join('')}</div>` : ''}
    `;
  }


  function buildProSolutionBlocks(result) {
    if (!result.proMode) return '';

    const blocks = [];

    if (result.pro.numericSteps.length > 0) {
      const stepsHtml = result.pro.numericSteps.map((step) => `
        <li>
          <strong>${step.label}</strong><br>
          ${formatNumber(step.from, 2)} j × ${formatNumber(step.factor, 2)} = <strong>${formatNumber(step.to, 2)} j</strong><br>
          <span class="diab-inline-note">${step.note}</span>
        </li>
      `).join('');

      blocks.push(`
        <div class="diab-solution__pro">
          <span class="diab-badge diab-badge--pro">Rozszerzenie<sup class="pro-superscript">PRO</sup></span>
          <p>Po wyliczeniu bazowej insuliny na posiłek (<strong>${formatNumber(result.baseMealInsulin, 2)} j</strong>) stosujemy modyfikatory liczbowe wybrane w tym zadaniu.</p>
          <ol class="diab-solution__steps diab-solution__steps--compact">
            ${stepsHtml}
            <li>
              <strong>Końcowa insulina potrzebna na posiłek po modyfikatorach PRO</strong><br>
              <strong>${formatNumber(result.mealInsulin, 2)} j</strong>
            </li>
            <li>
              <strong>Końcowy przelicznik PRO</strong><br>
              ${formatNumber(result.carbs, 1)} g ÷ ${formatNumber(result.mealInsulin, 2)} j = <strong>${formatNumber(result.ratioExact, 2)} g/j</strong>
            </li>
          </ol>
        </div>
      `);
    }

    if (result.pro.advisories.length > 0) {
      const advisoriesHtml = result.pro.advisories.map((item) => `
        <li><strong>${item.title}.</strong> ${item.text}</li>
      `).join('');

      blocks.push(`
        <div class="diab-solution__pro">
          <span class="diab-badge diab-badge--pro">uwagi PRO</span>
          <p>Te czynniki są ważne klinicznie, ale nie da się ich bezpiecznie przeliczyć jednym stałym procentem dla każdego. Dlatego traktujemy je jako uwagi interpretacyjne (bez automatycznej zmiany g/j).</p>
          <ul class="diab-pro-summary">
            ${advisoriesHtml}
          </ul>
        </div>
      `);
    }
    if (blocks.length === 0) {
      return '';
    }

    return blocks.join('');
  }


  function buildProQuestionSolutionBlocks(result) {
    const questions = getActiveProQuestions(result);

    if (!questions.length) {
      return '';
    }

    return questions.map((question) => `
      <div class="diab-solution__pro">
        <span class="diab-badge diab-badge--pro">pytanie PRO</span>
        <p><strong>${question.title}</strong></p>
        <p><strong>Poprawna odpowiedź:</strong> ${question.correctText}</p>
        <p>${question.explanation}</p>
      </div>
    `).join('');
  }

  function buildSolutionSourceGrid(result) {
    const items = [
      {
        label: 'DDI z wczoraj',
        value: `${formatNumber(result.ddi, 1)} j`,
        note: 'To suma wszystkich dawek insuliny z dnia poprzedniego, także bazy.'
      },
      {
        label: 'Stała liczba ze wzoru',
        value: '1800',
        note: 'Tę stałą dzielimy przez DDI, aby policzyć insulinowrażliwość.'
      },
      {
        label: 'Glikemia przed posiłkiem',
        value: `${formatNumber(result.glucoseBefore, 0)} mg/dl`,
        note: 'To punkt startowy przed analizowanym posiłkiem.'
      },
      {
        label: 'Glikemia 2–3 h po posiłku',
        value: `${formatNumber(result.glucoseAfter, 0)} mg/dl`,
        note: 'Ta liczba pokazuje efekt działania insuliny i posiłku.'
      },
      {
        label: 'Węglowodany w posiłku',
        value: `${formatNumber(result.carbs, 1)} g`,
        note: 'To liczba gramów, które na końcu podstawimy do licznika wzoru.'
      },
      {
        label: 'Podana insulina',
        value: `${formatNumber(result.bolusDose, 1)} j`,
        note: 'To dawka podana przed posiłkiem. Nie zawsze w całości trafia do wzoru.'
      },
      {
        label: 'Próg stabilnej różnicy',
        value: `±${formatNumber(result.threshold, 0)} mg/dl`,
        note: 'Jeśli różnica mieści się w tym zakresie, uznajemy dawkę za adekwatną.'
      }
    ];

    return `
      <div>
        <p class="diab-solution__section-title diab-solution__section-title--center">Skąd biorą się liczby do działania?</p>
        <div class="diab-solution__source-grid">
          ${items.map((item) => `
            <div class="diab-solution__source-item">
              <span class="diab-solution__source-label">${item.label}</span>
              <strong class="diab-solution__source-value">${item.value}</strong>
              <span class="diab-solution__source-note">${item.note}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function buildBalanceVisualHtml(result) {
    let middleLabel = 'Nic nie dodajemy ani nie odejmujemy';
    let middleValue = '0 j';
    let sign = '+';
    let middleNote = 'Różnica glikemii jest mała, więc podana dawka wygląda na prawidłową.';

    if (result.scenarioType === 'tooLittle') {
      middleLabel = 'Brakująca insulina';
      middleValue = `${formatNumber(result.adjustmentRounded, 1)} j`;
      middleNote = 'Tę ilość trzeba dodać, bo po posiłku glikemia wzrosła za mocno.';
    } else if (result.scenarioType === 'tooMuch') {
      middleLabel = 'Nadmiar / korekta';
      middleValue = `${formatNumber(result.adjustmentRounded, 1)} j`;
      middleNote = 'Tę ilość odejmujemy, bo nie była potrzebna na samo jedzenie.';
      sign = '−';
    }

    return `
      <div class="diab-solution__balance-wrap">
        <p class="diab-solution__section-title">Mini-wizualizacja: jak powstaje insulina „na posiłek”?</p>
        <div class="diab-solution__balance">
          <div class="diab-solution__balance-box">
            <span class="diab-solution__source-label">Podana insulina</span>
            <strong class="diab-solution__source-value">${formatNumber(result.bolusDose, 1)} j</strong>
            <span class="diab-solution__source-note">To liczba z zadania — tyle podano przed posiłkiem.</span>
          </div>
          <div class="diab-solution__balance-symbol">${sign}</div>
          <div class="diab-solution__balance-box">
            <span class="diab-solution__source-label">${middleLabel}</span>
            <strong class="diab-solution__source-value">${middleValue}</strong>
            <span class="diab-solution__source-note">${middleNote}</span>
          </div>
          <div class="diab-solution__balance-symbol">=</div>
          <div class="diab-solution__balance-box diab-solution__balance-box--accent">
            <span class="diab-solution__source-label">Insulina, którą podstawiamy do wzoru</span>
            <strong class="diab-solution__source-value">${formatNumber(result.baseMealInsulin, 2)} j</strong>
            <span class="diab-solution__source-note">To jest insulina naprawdę potrzebna na ten posiłek według zasady L.</span>
          </div>
        </div>
      </div>
    `;
  }

  function buildTodayUseHtml(result) {
  const exactLabel = result.proMode && result.pro.numericSteps.length > 0
    ? 'Końcowy wynik do zastosowania dziś w tym zadaniu'
    : 'Wniosek do zastosowania dziś';

  return `
    <div>
      <p class="diab-solution__section-title diab-solution__section-title--center">Co z tym wynikiem robisz dzisiaj?</p>
      <div class="diab-solution__today">
        <div class="diab-solution__today-item diab-solution__today-item--teal">
          <strong>${exactLabel}</strong>
          <span>Wyliczony przelicznik dotyczy odpowiedniego posiłku <strong>bieżącego dnia</strong>, np. śniadania dzisiaj liczonego na podstawie śniadania z wczoraj.</span>
          <span class="diab-solution__today-number">1 j na około ${formatNumber(result.ratioRounded, 0)} g węglowodanów</span>
        </div>
        <div class="diab-solution__today-item diab-solution__today-item--teal">
          <strong>Ważna uwaga</strong>
          <span>Ten przelicznik mówi o insulinie <strong>na jedzenie</strong>. Jeśli glikemia przed dzisiejszym posiłkiem jest za wysoka, ewentualną korektę liczysz osobno.</span>
        </div>
      </div>
    </div>
  `;
}

function buildSolutionHtml(result) {
    const sensitivityText = `${formatNumber(1800, 0)} ÷ ${formatNumber(result.ddi, 1)} = ${formatNumber(result.sensitivityExact, 1)} mg/dl/j`;
    const sensitivityPracticalText = `W tym module przyjmujemy też wartość praktyczną: 1 j obniża glikemię o około ${formatNumber(result.sensitivityPractical, 0)} mg/dl.`;
    const deltaText = `${formatNumber(result.glucoseAfter, 0)} − ${formatNumber(result.glucoseBefore, 0)} = ${result.delta > 0 ? '+' : ''}${formatNumber(result.delta, 0)} mg/dl`;
    const hasNumericPro = result.proMode && result.pro.numericSteps.length > 0;
    const ratioForBaseStep = hasNumericPro ? result.baseRatioExact : result.ratioExact;
    const insulinForBaseStep = hasNumericPro ? result.baseMealInsulin : result.mealInsulin;
    const ratioForBaseText = formatNumber(ratioForBaseStep, 2);
    const ratioForBaseRounded = hasNumericPro ? result.baseRatioRounded : result.ratioRounded;
    const ratioForBaseRoundedText = formatNumber(ratioForBaseRounded, 0);
    const showBaseRounded = ratioForBaseText !== ratioForBaseRoundedText;
    const baseRoundedNote = showBaseRounded
      ? ` W praktyce możesz użyć także wyniku zaokrąglonego do <strong>${ratioForBaseRoundedText} g/j</strong>.`
      : '';

    let scenarioSteps = '';
    let meaningStep = '';

    if (result.scenarioType === 'stable') {
      scenarioSteps = `
        <li>
          <strong>Krok 4. Oceń, czy dawkę trzeba poprawiać</strong><br>
          Różnica wynosi tylko <strong>${formatNumber(Math.abs(result.delta), 0)} mg/dl</strong>, czyli mieści się w granicy ±${formatNumber(result.threshold, 0)} mg/dl. To znaczy, że dawka wygląda na adekwatną.
        </li>
        <li>
          <strong>Krok 5. Jaka insulina naprawdę była potrzebna na ten posiłek?</strong><br>
          Skoro glikemia prawie się nie zmieniła, do wzoru bierzemy dokładnie podaną dawkę: <strong>${formatNumber(result.bolusDose, 1)} j</strong>. Niczego nie dodajemy i niczego nie odejmujemy.
        </li>
      `;
      meaningStep = `
        <li>
          <strong>Krok ${hasNumericPro ? 8 : 7}. Co oznacza ten wynik?</strong><br>
          Wynik <strong>${ratioForBaseText} g/j</strong> oznacza, że 1 j insuliny wystarcza na około <strong>${ratioForBaseText} g</strong> węglowodanów.${baseRoundedNote}
        </li>
      `;
    } else if (result.scenarioType === 'tooLittle') {
      scenarioSteps = `
        <li>
          <strong>Krok 4. Co oznacza wzrost glikemii po posiłku?</strong><br>
          Glikemia po posiłku wzrosła za mocno, więc insuliny było za mało. Teraz pytamy: <em>ile jednostek zabrakło?</em>
        </li>
        <li>
          <strong>Krok 5. Policz brakującą insulinę</strong><br>
          Skoro 1 j obniża glikemię o około <strong>${formatNumber(result.sensitivityPractical, 0)} mg/dl</strong>, to wzrost o <strong>${formatNumber(Math.abs(result.delta), 0)} mg/dl</strong> zapisujemy tak:<br>
          <strong>${formatNumber(Math.abs(result.delta), 0)} ÷ ${formatNumber(result.sensitivityPractical, 0)} = ${formatNumber(result.adjustmentRaw, 2)} j</strong><br>
          Po praktycznym zaokrągleniu do 0,5 j wychodzi <strong>${formatNumber(result.adjustmentRounded, 1)} j</strong>. Tyle mniej więcej zabrakło.
        </li>
        <li>
          <strong>Krok 6. Policz insulinę, która naprawdę powinna była pójść na posiłek</strong><br>
          Podano <strong>${formatNumber(result.bolusDose, 1)} j</strong>, ale zabrakło <strong>${formatNumber(result.adjustmentRounded, 1)} j</strong>, więc:<br>
          <strong>${formatNumber(result.bolusDose, 1)} j + ${formatNumber(result.adjustmentRounded, 1)} j = ${formatNumber(result.baseMealInsulin, 2)} j</strong>
        </li>
      `;
      meaningStep = `
        <li>
          <strong>Krok 8. Co oznacza ten wynik?</strong><br>
          Wynik <strong>${ratioForBaseText} g/j</strong> oznacza, że 1 j insuliny powinna przypadać na około <strong>${ratioForBaseText} g</strong> węglowodanów.${baseRoundedNote}
        </li>
      `;
    } else {
      scenarioSteps = `
        <li>
          <strong>Krok 4. Co oznacza spadek glikemii po posiłku?</strong><br>
          Glikemia po posiłku spadła za mocno, więc część podanej insuliny nie była potrzebna na samo jedzenie. Mogła to być korekta albo po prostu nadmiar względem posiłku.
        </li>
        <li>
          <strong>Krok 5. Policz insulinę „nadmiarową”</strong><br>
          Skoro 1 j obniża glikemię o około <strong>${formatNumber(result.sensitivityPractical, 0)} mg/dl</strong>, to spadek o <strong>${formatNumber(Math.abs(result.delta), 0)} mg/dl</strong> zapisujemy tak:<br>
          <strong>${formatNumber(Math.abs(result.delta), 0)} ÷ ${formatNumber(result.sensitivityPractical, 0)} = ${formatNumber(result.adjustmentRaw, 2)} j</strong><br>
          Po praktycznym zaokrągleniu do 0,5 j wychodzi <strong>${formatNumber(result.adjustmentRounded, 1)} j</strong>. Tyle odejmujemy od całej dawki.
        </li>
        <li>
          <strong>Krok 6. Policz insulinę, która naprawdę była na posiłek</strong><br>
          Podano <strong>${formatNumber(result.bolusDose, 1)} j</strong>, ale około <strong>${formatNumber(result.adjustmentRounded, 1)} j</strong> było nadmiarem, więc:<br>
          <strong>${formatNumber(result.bolusDose, 1)} j − ${formatNumber(result.adjustmentRounded, 1)} j = ${formatNumber(result.baseMealInsulin, 2)} j</strong>
        </li>
      `;
      meaningStep = `
        <li>
          <strong>Krok 8. Co oznacza ten wynik?</strong><br>
          Wynik <strong>${ratioForBaseText} g/j</strong> oznacza, że 1 j insuliny powinna przypadać na około <strong>${ratioForBaseText} g</strong> węglowodanów.${baseRoundedNote}
        </li>
      `;
    }

    const baseRatioStepLabel = hasNumericPro
      ? 'Krok 7. Oblicz bazowy przelicznik z samej zasady L'
      : (result.scenarioType === 'stable' ? 'Krok 6. Oblicz przelicznik doposiłkowy' : 'Krok 7. Oblicz przelicznik doposiłkowy');

    // Nie pokazujemy na końcu dodatkowych pól typu "Wynik dokładny" / "Wynik praktyczny".
    // Wynik i jego sens są już opisane w krokach oraz w sekcji "Co z tym wynikiem robisz dzisiaj?".

    return `
      <div class="diab-solution__intro">
        <p>${getScenarioNarrative(result)}</p>
      </div>
      ${buildSolutionSourceGrid(result)}
      <ol class="diab-solution__steps">
        <li>
          <strong>Krok 1. DDI — skąd ta liczba?</strong><br>
          DDI to dobowa dawka insuliny z dnia poprzedniego. W tym zadaniu wynosi <strong>${formatNumber(result.ddi, 1)} j</strong>. To właśnie tę liczbę wkładamy do wzoru 1800/DDI.
        </li>
        <li>
          <strong>Krok 2. Policz insulinowrażliwość</strong><br>
          Liczymy: <strong>${sensitivityText}</strong><br>
          Czytamy to tak: 1 j insuliny obniża glikemię o około <strong>${formatNumber(result.sensitivityExact, 1)} mg/dl</strong>. ${sensitivityPracticalText}
        </li>
        <li>
          <strong>Krok 3. Policz różnicę glikemii</strong><br>
          Bierzemy glikemię po posiłku i odejmujemy glikemię sprzed posiłku: <strong>${deltaText}</strong><br>
          Znak <strong>plus</strong> oznacza wzrost glikemii po posiłku. Znak <strong>minus</strong> oznacza spadek.
        </li>
        ${scenarioSteps}
        <li>
          <strong>${baseRatioStepLabel}</strong><br>
          Do licznika wzoru wpisujemy wszystkie węglowodany z posiłku: <strong>${formatNumber(result.carbs, 1)} g</strong>.<br>
          Do mianownika wpisujemy tylko insulinę, która naprawdę była potrzebna na posiłek: <strong>${formatNumber(insulinForBaseStep, hasNumericPro ? 2 : 2)} j</strong>.<br>
          Liczymy: <strong>${formatNumber(result.carbs, 1)} g ÷ ${formatNumber(insulinForBaseStep, 2)} j = ${formatNumber(ratioForBaseStep, 2)} g/j</strong>
        </li>
        ${meaningStep}
      </ol>
            ${buildProSolutionBlocks(result)}
      ${buildTodayUseHtml(result)}
      ${buildProQuestionSolutionBlocks(result)}
    `;
  }

  function isAnswerCorrect(answer, result) {
    if (!Number.isFinite(answer)) return false;
    if (Math.abs(answer - result.ratioExact) <= RATIO_TOLERANCE) return true;
    if (Number.isFinite(result.strictRatioExact) && Math.abs(answer - result.strictRatioExact) <= RATIO_TOLERANCE) return true;
    return result.acceptedAnswers.some((accepted) => Math.abs(answer - accepted) < 0.01);
  }

  function bindInactiveSharedButtons() {
    ['saveDataBtn', 'loadDataBtn', 'saveDataBtnSidebar', 'loadDataBtnSidebar'].forEach((id) => {
      const btn = qs(id);
      if (!btn) return;
      btn.setAttribute('aria-disabled', 'true');
      btn.addEventListener('click', (event) => {
        event.preventDefault();
      });
    });
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clearRewardLayer(layer) {
    if (!layer) return;
    if (layer.dataset.timeoutId) {
      window.clearTimeout(Number(layer.dataset.timeoutId));
      delete layer.dataset.timeoutId;
    }
    diabClearHtml(layer);
    layer.hidden = true;
  }

  function celebrateSuccess(layer) {
    if (!layer) return;
    clearRewardLayer(layer);
    layer.hidden = false;

    const badge = document.createElement('div');
    badge.className = 'diab-reward-badge';
    diabSetTrustedHtml(badge, '<span class="diab-reward-badge__emoji" aria-hidden="true">🎉</span><span>Brawo!</span>', 'reward badge');
    layer.appendChild(badge);

    if (!prefersReducedMotion()) {
      const confettiColors = ['#00b0a6', '#00838d', '#ffd54f', '#ff8a65', '#7e57c2', '#ef5350'];
      const balloonColors = ['#29b6f6', '#66bb6a', '#ffca28', '#ab47bc', '#ff7043'];
      const sparkleIcons = ['✨', '⭐', '💙'];

      for (let i = 0; i < 32; i += 1) {
        const piece = document.createElement('span');
        piece.className = `diab-confetti${i % 4 === 0 ? ' diab-confetti--line' : ''}`;
        piece.style.setProperty('--x', formatNumber(Math.random() * 100, 2).replace(',', '.'));
        piece.style.setProperty('--drift', `${((Math.random() * 34) - 17).toFixed(2)}vw`);
        piece.style.setProperty('--rot', `${((Math.random() * 1080) - 540).toFixed(0)}deg`);
        piece.style.setProperty('--delay', `${(Math.random() * 0.45).toFixed(2)}s`);
        piece.style.setProperty('--dur', `${(2.3 + Math.random() * 1.1).toFixed(2)}s`);
        piece.style.setProperty('--c', confettiColors[i % confettiColors.length]);
        layer.appendChild(piece);
      }

      for (let i = 0; i < 5; i += 1) {
        const balloon = document.createElement('span');
        balloon.className = 'diab-balloon';
        balloon.style.setProperty('--x', `${12 + (i * 18) + (Math.random() * 6 - 3)}`);
        balloon.style.setProperty('--drift', `${((Math.random() * 18) - 9).toFixed(2)}vw`);
        balloon.style.setProperty('--delay', `${(0.1 + Math.random() * 0.45).toFixed(2)}s`);
        balloon.style.setProperty('--dur', `${(3.1 + Math.random() * 1.1).toFixed(2)}s`);
        balloon.style.setProperty('--c', balloonColors[i % balloonColors.length]);
        layer.appendChild(balloon);
      }

      for (let i = 0; i < 7; i += 1) {
        const sparkle = document.createElement('span');
        sparkle.className = 'diab-sparkle';
        sparkle.textContent = sparkleIcons[i % sparkleIcons.length];
        sparkle.style.setProperty('--x', `${18 + Math.random() * 64}`);
        sparkle.style.setProperty('--y', `${18 + Math.random() * 28}`);
        sparkle.style.setProperty('--delay', `${(0.15 + Math.random() * 0.45).toFixed(2)}s`);
        layer.appendChild(sparkle);
      }
    }

    const timeoutId = window.setTimeout(() => {
      clearRewardLayer(layer);
    }, prefersReducedMotion() ? 1600 : 4200);
    layer.dataset.timeoutId = String(timeoutId);
  }

  

  function capitalizeFirst(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }


  // ===== Film: pogrubianie liczb i jednostek (render HTML + typewriter) =====
  const FILM_BOLD_REGEX = (() => {
    const sep = '[ \u00A0\u202F]';
    const num = `[+\\-−]?\\d[\\d \u00A0\u202F]*(?:[.,]\\d+)?`;
    const range = `${num}${sep}*[–-]${sep}*${num}`;
    const unit = '(?:mg\\/dl\\/j|mg\\/dl|g\\/j|j|g|h|%)';
    const rangeWithUnit = `${range}(?:${sep}*${unit})?`;
    const numWithUnit = `${num}(?:${sep}*${unit})?`;
    const standaloneUnit = '(?:mg\\/dl\\/j|mg\\/dl|g\\/j)';
    return new RegExp(`${rangeWithUnit}|${numWithUnit}|${standaloneUnit}`, 'g');
  })();

  function escapeHtml(value) {
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.escapeHtml === 'function') {
      return window.VildaHtml.escapeHtml(value);
    }
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function splitFilmBoldMarkers(text) {
    const source = String(text || '');
    const parts = [];
    if (!source) return parts;

    let cursor = 0;
    while (cursor < source.length) {
      const start = source.indexOf('**', cursor);
      if (start === -1) {
        parts.push({ text: source.slice(cursor), forceBold: false });
        break;
      }

      const end = source.indexOf('**', start + 2);
      if (end === -1) {
        // niedomknięte ** — traktujemy resztę jako zwykły tekst
        parts.push({ text: source.slice(cursor), forceBold: false });
        break;
      }

      if (start > cursor) {
        parts.push({ text: source.slice(cursor, start), forceBold: false });
      }

      parts.push({ text: source.slice(start + 2, end), forceBold: true });
      cursor = end + 2;
    }

    return parts;
  }

  function tokenizeFilmText(text) {
    const source = String(text || '');
    const segments = [];
    if (!source) return segments;

    // 1) Najpierw obsłuż znaczniki **...** (wymuszony bold całych fragmentów)
    const chunks = splitFilmBoldMarkers(source);

    // 2) Potem w zwykłych fragmentach pogrubiaj tylko liczby i jednostki
    chunks.forEach((chunk) => {
      const chunkText = String(chunk && chunk.text ? chunk.text : '');
      if (!chunkText) return;

      if (chunk.forceBold) {
        segments.push({ text: chunkText, bold: true });
        return;
      }

      FILM_BOLD_REGEX.lastIndex = 0;
      let last = 0;
      let match;

      while ((match = FILM_BOLD_REGEX.exec(chunkText)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (start > last) {
          segments.push({ text: chunkText.slice(last, start), bold: false });
        }
        segments.push({ text: match[0], bold: true });
        last = end;
      }

      if (last < chunkText.length) {
        segments.push({ text: chunkText.slice(last), bold: false });
      }
    });

    return segments;
  }

  function filmSegmentsLength(segments) {
    if (!Array.isArray(segments)) return 0;
    return segments.reduce((sum, seg) => sum + String(seg && seg.text ? seg.text : '').length, 0);
  }

  function renderFilmSegmentsPartial(segments, charCount, el) {
    if (!el) return;
    const list = Array.isArray(segments) ? segments : [];
    const total = filmSegmentsLength(list);
    const clamped = Math.max(0, Math.min(total, Number(charCount) || 0));

    let remaining = clamped;
    let html = '';

    for (let i = 0; i < list.length; i += 1) {
      if (remaining <= 0) break;
      const seg = list[i] || { text: '', bold: false };
      const segText = String(seg.text || '');
      if (!segText) continue;
      const part = segText.slice(0, remaining);
      remaining -= part.length;
      if (!part) continue;

      const safe = escapeHtml(part);
      if (seg.bold) {
        html += `<span class="diab-film-bold">${safe}</span>`;
      } else {
        html += safe;
      }
    }

    diabSetTrustedHtml(el, html, 'film typewriter markup');
  }

  function buildFilmSteps(result) {
    if (!result) return [];

    const mealLower = result.mealType || '';
    const mealDisplay = capitalizeFirst(mealLower);

    const ddiText = formatNumber(result.ddi, 1);
    const carbsText = formatNumber(result.carbs, 1);
    const bolusText = formatNumber(result.bolusDose, 1);
    const beforeText = formatNumber(result.glucoseBefore, 0);
    const afterText = formatNumber(result.glucoseAfter, 0);

    const sensitivityExactText = formatNumber(result.sensitivityExact, 1);
    const sensitivityPracticalText = formatNumber(result.sensitivityPractical, 0);

    const deltaSign = result.delta > 0 ? '+' : '';
    const deltaText = `${deltaSign}${formatNumber(result.delta, 0)}`;
    const absDelta = Math.abs(result.delta);
    const absDeltaText = formatNumber(absDelta, 0);

    const thresholdText = formatNumber(result.threshold, 0);
    const scenarioLabel = getScenarioLabel(result.scenarioType);

    const adjustmentRawText = formatNumber(result.adjustmentRaw, 2);
    const adjustmentRoundedText = formatNumber(result.adjustmentRounded, 1);

    const baseMealInsulinText = formatNumber(result.baseMealInsulin, 1);

    const hasNumericPro =
      Boolean(
        result.proMode &&
        result.pro &&
        Array.isArray(result.pro.numericSteps) &&
        result.pro.numericSteps.length > 0
      );

    const finalInsulinDigits = hasNumericPro ? 2 : 1;
    const finalMealInsulinText = formatNumber(result.mealInsulin, finalInsulinDigits);

    const ratioExactText = formatNumber(result.ratioExact, 2);
    const ratioRoundedText = formatNumber(result.ratioRounded, 0);

    const withinThreshold = absDelta <= result.threshold;

    const rawSteps = [];

    function addStep(title, body, sub) {
      rawSteps.push({
        title: String(title || '').trim(),
        body: String(body || '').trim(),
        sub: String(sub || '')
      });
    }

    // KROK: dane z wczoraj
    addStep(
      'DANE (z wczoraj)',
      `Posiłek: ${mealDisplay}
Dobowa dawka insuliny (DDI) = ${ddiText} j
Glikemia przed posiłkiem = ${beforeText} mg/dl
Węglowodany w posiłku = ${carbsText} g
Insulina podana przed posiłkiem = ${bolusText} j
Glikemia 2–3 h po posiłku = ${afterText} mg/dl`,
      `To są liczby z wczorajszego posiłku.
**Najważniejsze: liczysz z wczoraj, stosujesz dziś.**
DDI = dobowa dawka insuliny, czyli suma insuliny z całej doby (bazalna + bolusy).`
    );

    // KROK: insulinowrażliwość
    addStep(
      'INSULINOWRAŻLIWOŚĆ (1800/DDI)',
      `1800 ÷ ${ddiText} = ${sensitivityExactText} mg/dl/j
Wartość praktyczna ≈ ${sensitivityPracticalText} mg/dl/j`,
      `Insulinowrażliwość mówi, o ile 1 jednostka insuliny (1 j) obniża glikemię.
W dalszych krokach używamy wartości praktycznej (zaokrąglonej), żeby łatwiej liczyć.`
    );

    // KROK: różnica glikemii
    addStep(
      'RÓŻNICA GLIKEMII',
      `Różnica = po posiłku − przed posiłkiem
= ${afterText} − ${beforeText}
= ${deltaText} mg/dl`,
      `Ta różnica mówi, czy insuliny było:
• w sam raz (mała różnica),
• za mało (duży wzrost po posiłku),
• za dużo (duży spadek po posiłku).`
    );

    // KROK: próg stabilności
    const compareSymbol = withinThreshold ? '≤' : '>';
    addStep(
      'CZY RÓŻNICA JEST „MAŁA”?',
      `Próg stabilności: ±${thresholdText} mg/dl
|${deltaText}| = ${absDeltaText} mg/dl
${absDeltaText} ${compareSymbol} ${thresholdText}
Wniosek: ${scenarioLabel}`,
      result.scenarioType === 'stable'
        ? `Ponieważ różnica mieści się w progu, uznajemy że dawka była dobrana prawidłowo.
Nie dodajemy i nie odejmujemy korekty.`
        : result.scenarioType === 'tooLittle'
          ? `Ponieważ glikemia po posiłku wzrosła za mocno, insuliny było za mało.
Musimy policzyć, ile jednostek zabrakło.`
          : `Ponieważ glikemia po posiłku spadła za mocno, insuliny było za dużo.
Musimy policzyć, ile jednostek było nadmiarem.`
    );

    // KROK: brakująca insulina (gdy za mało)
    addStep(
      'JEŚLI GLIKEMIA WZROSŁA: ILE INSULINY ZABRAKŁO?',
      result.scenarioType === 'tooLittle'
        ? `Wzrost glikemii = ${absDeltaText} mg/dl
Dzielimy przez insulinowrażliwość (${sensitivityPracticalText} mg/dl/j):
${absDeltaText} ÷ ${sensitivityPracticalText} = ${adjustmentRawText} j
Zaokrąglenie do 0,5 j → ${adjustmentRoundedText} j`
        : `Ten krok: nie dotyczy w tym zadaniu.
Brakująca insulina = 0,0 j`,
      result.scenarioType === 'tooLittle'
        ? `Bierzemy "wzrost" (ile mg/dl cukier poszedł w górę) i dzielimy przez insulinowrażliwość.
To daje liczbę jednostek, których zabrakło na pokrycie posiłku.`
        : `Tu nie było dużego wzrostu glikemii po posiłku, więc nie doliczamy brakującej insuliny.`
    );

    // KROK: nadmiar insuliny (gdy za dużo)
    addStep(
      'JEŚLI GLIKEMIA SPADŁA: ILE INSULINY BYŁO NADMIAREM?',
      result.scenarioType === 'tooMuch'
        ? `Spadek glikemii = ${absDeltaText} mg/dl
Dzielimy przez insulinowrażliwość (${sensitivityPracticalText} mg/dl/j):
${absDeltaText} ÷ ${sensitivityPracticalText} = ${adjustmentRawText} j
Zaokrąglenie do 0,5 j → ${adjustmentRoundedText} j`
        : `Ten krok: nie dotyczy w tym zadaniu.
Nadmiar insuliny = 0,0 j`,
      result.scenarioType === 'tooMuch'
        ? `Bierzemy "spadek" (ile mg/dl cukier spadł w dół) i dzielimy przez insulinowrażliwość.
To daje liczbę jednostek, które były nadmiarem w stosunku do posiłku.`
        : `Tu nie było dużego spadku glikemii po posiłku, więc nie odejmujemy nadmiaru insuliny.`
    );

    // KROK: insulina „na posiłek” po zasadzie L (po ewentualnej korekcie)
    let step7Body = '';
    if (result.scenarioType === 'tooLittle') {
      step7Body =
`Insulina podana przed posiłkiem + brakująca insulina
${bolusText} j + ${adjustmentRoundedText} j = ${baseMealInsulinText} j`;
    } else if (result.scenarioType === 'tooMuch') {
      step7Body =
`Insulina podana przed posiłkiem − nadmiar insuliny
${bolusText} j − ${adjustmentRoundedText} j = ${baseMealInsulinText} j`;
    } else {
      step7Body =
`Ponieważ glikemia była stabilna, dawka wygląda na dobrą.
Insulina na posiłek = ${bolusText} j`;
    }

    const proHasAny =
      Boolean(
        result.proMode &&
        result.pro &&
        (
          (Array.isArray(result.pro.numericSteps) && result.pro.numericSteps.length > 0) ||
          (Array.isArray(result.pro.advisories) && result.pro.advisories.length > 0)
        )
      );

    addStep(
      'INSULINA, KTÓRA NAPRAWDĘ „POSZŁA NA POSIŁEK”',
      step7Body,
      result.proMode
        ? `To jest bazowa insulina „na posiłek” po zasadzie L: ${baseMealInsulinText} j.
${proHasAny ? 'W kolejnych krokach sprawdzimy modyfikatory PRO dla tego zadania.' : 'W tym zadaniu nie ma dodatkowych modyfikatorów PRO do przeliczenia dawki.'}`
        : `To jest insulina „na posiłek” w tym zadaniu: ${finalMealInsulinText} j.
W kolejnym kroku podzielimy węglowodany przez tę insulinę.`
    );

    // ===== KROKI PRO: każdy modyfikator osobno =====
    if (result.proMode && result.pro) {
      const numericSteps = Array.isArray(result.pro.numericSteps) ? result.pro.numericSteps : [];
      const advisories = Array.isArray(result.pro.advisories) ? result.pro.advisories : [];

      numericSteps.forEach((step) => {
        const pctText = formatSignedPercent(step.percent);
        const fromText = formatNumber(step.from, 2);
        const toText = formatNumber(step.to, 2);
        const factorText = formatNumber(step.factor, 2);

        const kindLabel = step.type === 'infection'
          ? 'INFEKCJA Z GORĄCZKĄ'
          : step.type === 'exercise'
            ? 'PLANOWANY WYSIŁEK'
            : 'MODYFIKATOR';

        const effectLine = step.percent > 0
          ? 'Większa insulina → mniejsze g/j (mniej gramów na 1 j).'
          : 'Mniejsza insulina → większe g/j (więcej gramów na 1 j).';

        addStep(
          `PRO — ${kindLabel}`,
          `Wybrano: ${step.label}
Zmiana dawki: ${pctText} → mnożymy ×${factorText}
Insulina przed modyfikatorem = ${fromText} j
${fromText} j × ${factorText} = ${toText} j`,
          `${step.type === 'infection'
            ? 'Infekcja z gorączką zwykle zwiększa zapotrzebowanie na insulinę — dlatego w tym zadaniu zwiększamy dawkę procentowo.'
            : step.type === 'exercise'
              ? 'Planowany wysiłek zwykle zwiększa wrażliwość na insulinę — dlatego dla posiłku przed aktywnością zmniejszamy dawkę procentowo.'
              : 'Ten modyfikator zmienia dawkę procentowo.'}
${effectLine}`
        );
      });

      advisories.forEach((adv) => {
        if (adv.key === 'stress') {
          addStep(
            'PRO — STRES (uwaga interpretacyjna)',
            `Zaznaczono: stres
Może: podnosić glikemię i zmniejszać wrażliwość na insulinę
W tym module: brak jednego stałego % → nie zmieniamy automatycznie wyniku g/j`,
            `Stres może „podbić” glikemię niezależnie od posiłku.
To może sprawić, że z wczoraj wyjdzie potrzeba większej dawki, a więc wynik g/j może wyjść mniejszy.`
          );
        } else if (adv.key === 'fatProtein') {
          addStep(
            'PRO — BARDZO DUŻO BIAŁKA I TŁUSZCZU (uwaga)',
            `Zaznaczono: >200 kcal z białka i tłuszczu
Możliwy efekt: późniejszy wzrost glikemii (2–4 h po posiłku)
W tym module: wynik g/j liczysz normalnie, ale pamiętaj o tej „późnej górce”`,
            `Jeśli glikemia rośnie dopiero później, pomiar po 2–3 h może nie pokazać całego wpływu posiłku.
To może zmieniać interpretację wyniku, mimo że sam wzór g/j jest ten sam.`
          );
        }
      });
    }

    // KROK: przelicznik
    addStep(
      'PRZELICZNIK (g/j)',
      `Przelicznik = węglowodany ÷ insulina na posiłek
${carbsText} g ÷ ${finalMealInsulinText} j = ${ratioExactText} g/j
**Wynik praktyczny (zaokrąglenie) ≈ ${ratioRoundedText} g/j**`,
      `Ten wynik mówi, że średnio 1 j insuliny wystarcza na około ${ratioRoundedText} g węglowodanów w tym posiłku.`
    );

    // KROK: stosuj dziś
    addStep(
      'STOSUJ DZIŚ',
      `Ten przelicznik dotyczy posiłku: ${mealDisplay}.
Użyj go do ${mealLower} dzisiaj.
Nie przenoś automatycznie tego wyniku na inne posiłki.`,
      `**To jest klucz w tym ćwiczeniu:**
liczysz na podstawie wczorajszego posiłku, a wynik stosujesz do tego samego posiłku dzisiaj.`
    );

    return rawSteps.map((step, idx) => {
      const header = `KROK ${idx + 1} — ${step.title}`.trim();
      const body = step.body ? `${header}
${step.body}` : header;

      return {
        ops: body,
        sub: step.sub || ''
      };
    });
  }
  function createInteractiveFilmPlayer(options) {
    const modal = options && options.modal;
    const opsEl = options && options.opsEl;
    const subEl = options && options.subEl;

    const stepMetaEl = options && options.stepMetaEl;
    const closeBtn = options && options.closeBtn;
    const backdropEl = options && options.backdropEl;

    const prevBtn = options && options.prevBtn;
    const playBtn = options && options.playBtn;
    const stopBtn = options && options.stopBtn;
    const nextBtn = options && options.nextBtn;

    const playIcon = options && options.playIcon;
    const pauseIcon = options && options.pauseIcon;

    const getResult = options && options.getResult;

    const onOpen = options && options.onOpen;
    const onClose = options && options.onClose;

    const player = {
      isOpen: false,
      open: function () {},
      close: function () {}
    };

    if (!modal || !opsEl || !subEl || !playBtn || !stopBtn || !nextBtn || !prevBtn) {
      return player;
    }

    const state = {
      steps: [],
      index: 0,
      phase: 'ops', // 'ops' -> 'sub'
      opsPos: 0,
      subPos: 0,
      playing: false,
      done: false,
      rafId: 0,
      lastTs: 0,
      lastFocus: null
    };

    function setPlayIcons(isPlaying) {
      if (playIcon) playIcon.hidden = Boolean(isPlaying);
      if (pauseIcon) pauseIcon.hidden = !isPlaying;
    }

    function updateMeta() {
      if (!stepMetaEl) return;
      const total = state.steps.length || 0;
      const current = Math.min(state.index + 1, total);
      let suffix = '';

      if (state.playing) {
        suffix = ' • odtwarzanie…';
      } else if (state.done) {
        suffix = state.index >= total - 1 ? ' • koniec' : ' • gotowe — kliknij →';
      } else {
        suffix = ' • kliknij ▶';
      }

      stepMetaEl.textContent = total ? `Krok ${current}/${total}${suffix}` : '';
    }

    function updateControls() {
      const total = state.steps.length || 0;
      const atStart = state.index <= 0;
      const atEnd = state.index >= total - 1;

      // Możesz przewijać kroki nawet w trakcie animacji.
      prevBtn.disabled = total === 0 || atStart;
      nextBtn.disabled = total === 0 || atEnd;

      stopBtn.disabled = total === 0;
      playBtn.disabled = total === 0;
    }

    function cancelAnim() {
      if (state.rafId) {
        window.cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
    }



    function ensureStepRich(step) {
      if (!step) {
        return { ops: '', sub: '', opsSegments: [], subSegments: [], opsLen: 0, subLen: 0 };
      }

      if (!Array.isArray(step.opsSegments)) {
        step.opsSegments = tokenizeFilmText(step.ops || '');
      }
      if (!Number.isFinite(step.opsLen)) {
        step.opsLen = filmSegmentsLength(step.opsSegments);
      }

      if (!Array.isArray(step.subSegments)) {
        step.subSegments = tokenizeFilmText(step.sub || '');
      }
      if (!Number.isFinite(step.subLen)) {
        step.subLen = filmSegmentsLength(step.subSegments);
      }

      return step;
    }
    function resetStepView() {
      const step = ensureStepRich(state.steps[state.index] || { ops: '', sub: '' });
      diabClearHtml(opsEl);
      diabClearHtml(subEl);
      state.phase = 'ops';
      state.opsPos = 0;
      state.subPos = 0;
      state.done = false;

      // Jeśli prefer-reduced-motion, pokaż od razu (bez animacji)
      if (prefersReducedMotion()) {
        renderFilmSegmentsPartial(step.opsSegments, step.opsLen, opsEl);
        renderFilmSegmentsPartial(step.subSegments, step.subLen, subEl);
        state.done = true;
        state.playing = false;
      }

      setPlayIcons(false);
      updateMeta();
      updateControls();
    }

    function finishStep() {
      state.playing = false;
      state.done = true;
      cancelAnim();
      setPlayIcons(false);
      updateMeta();
      updateControls();
    }

    function tick(ts) {
      if (!state.playing) return;

      const step = ensureStepRich(state.steps[state.index] || { ops: '', sub: '' });
      const opsLen = step.opsLen || 0;
      const subLen = step.subLen || 0;

      if (!state.lastTs) {
        state.lastTs = ts;
      }

      const dt = ts - state.lastTs;
      state.lastTs = ts;

      // szybkość pisania: ok. 55 znaków/s (plus minimalnie 1 znak na klatkę)
      const charsPerSecond = 55;
      const charsToAdd = Math.max(1, Math.floor((dt / 1000) * charsPerSecond));

      if (state.phase === 'ops') {
        state.opsPos = Math.min(opsLen, state.opsPos + charsToAdd);
        renderFilmSegmentsPartial(step.opsSegments, state.opsPos, opsEl);

        if (state.opsPos >= opsLen) {
          state.phase = 'sub';
        }
      }

      if (state.phase === 'sub') {
        state.subPos = Math.min(subLen, state.subPos + charsToAdd);
        renderFilmSegmentsPartial(step.subSegments, state.subPos, subEl);
      }

      if (state.opsPos >= opsLen && state.subPos >= subLen) {
        finishStep();
        return;
      }

      state.rafId = window.requestAnimationFrame(tick);
    }

    function playCurrentStep() {
      if (!state.steps.length) return;

      // Jeśli krok był zakończony, odtwórz go od początku
      if (state.done) {
        resetStepView();
      }

      state.playing = true;
      state.lastTs = 0;
      cancelAnim();
      setPlayIcons(true);
      updateMeta();
      updateControls();
      state.rafId = window.requestAnimationFrame(tick);
    }

    function pause() {
      state.playing = false;
      cancelAnim();
      setPlayIcons(false);
      updateMeta();
      updateControls();
    }

    function stop() {
      state.playing = false;
      cancelAnim();
      resetStepView();
    }

    function goToStep(nextIndex, autoplay) {
      const total = state.steps.length || 0;
      if (!total) return;

      const clamped = Math.max(0, Math.min(total - 1, nextIndex));
      state.index = clamped;
      state.playing = false;
      cancelAnim();
      resetStepView();
      if (autoplay) {
        playCurrentStep();
      }
    }

    function open() {
      const result = typeof getResult === 'function' ? getResult() : null;
      if (!result) return;

      state.steps = buildFilmSteps(result);
      state.index = 0;
      state.playing = false;
      state.done = false;

      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('diab-film-open');
      player.isOpen = true;

      if (typeof onOpen === 'function') {
        onOpen();
      }

      // aria-expanded na przycisku "Odtwórz film" ustawiamy w init (po stronie listenera)
      state.lastFocus = document.activeElement;

      // Upewnij się, że ikony (lucide) są wyrenderowane
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }

      resetStepView();

      // Auto: odtwarzamy pierwszy krok, a przejście do kolejnych wymaga kliknięcia →
      playCurrentStep();

      // Fokus na kontrolkach
      playBtn.focus({ preventScroll: true });
    }

    function close(silent) {
      state.playing = false;
      cancelAnim();

      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('diab-film-open');
      player.isOpen = false;


      if (typeof onClose === 'function') {
        onClose();
      }

      setPlayIcons(false);

      if (!silent && state.lastFocus && typeof state.lastFocus.focus === 'function') {
        state.lastFocus.focus({ preventScroll: true });
      }
      state.lastFocus = null;
    }

    function onKeyDown(event) {
      if (!player.isOpen) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
        return;
      }

      if (event.key === 'ArrowRight') {
        if (!nextBtn.disabled) {
          event.preventDefault();
          goToStep(state.index + 1, true);
        }
        return;
      }

      if (event.key === 'ArrowLeft') {
        if (!prevBtn.disabled) {
          event.preventDefault();
          goToStep(state.index - 1, true);
        }
        return;
      }

      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        if (state.playing) pause();
        else playCurrentStep();
      }
    }

    // Sterowanie przyciskami
    playBtn.addEventListener('click', function (event) {
      event.preventDefault();
      if (state.playing) {
        pause();
      } else {
        playCurrentStep();
      }
    });

    stopBtn.addEventListener('click', function (event) {
      event.preventDefault();
      stop();
    });

    prevBtn.addEventListener('click', function (event) {
      event.preventDefault();
      if (prevBtn.disabled) return;
      goToStep(state.index - 1, true);
    });

    nextBtn.addEventListener('click', function (event) {
      event.preventDefault();
      if (nextBtn.disabled) return;
      goToStep(state.index + 1, true);
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function (event) {
        event.preventDefault();
        close(false);
      });
    }

    if (backdropEl) {
      backdropEl.addEventListener('click', function () {
        close(false);
      });
    }

    document.addEventListener('keydown', onKeyDown);

    player.open = open;
    player.close = close;

    return player;
  }

function init() {
    const doctorForm = qs('doctorForm');
    const moduleLauncher = qs('moduleLauncher');
    const macroLauncherBtn = qs('macroLauncherBtn');
    const moduleLauncherBtn = qs('moduleLauncherBtn');
    const calculatorLauncherBtn = qs('calculatorLauncherBtn');
    const moduleBackBtn = qs('moduleBackBtn');
    const macroContent = qs('macroContent');
    const calculatorContent = qs('calculatorContent');
    const moduleContent = qs('moduleContent');
    const moduleMainHeading = qs('moduleMainHeading');
    const taskSetup = qs('taskSetup');
    const taskArea = qs('taskArea');
    const setupStatus = qs('setupStatus');
    const generateBtn = qs('generateTaskBtn');
    const prepareBtn = qs('prepareTaskBtn');
    const submitBtn = qs('submitAnswerBtn');
    const newTaskBtn = qs('newTaskBtn');
    const showSolutionBtn = qs('showSolutionBtn');
    const CLEAR_ALL_EVENT = 'cukrzyca:clear-all-modules';

    const howToToggleBtn = qs('howToToggleBtn');
    const howToContent = qs('howToContent');
    if (howToToggleBtn && howToContent) {
      howToToggleBtn.addEventListener('click', function (event) {
        event.preventDefault();
        const isOpen = !howToContent.hidden;
        howToContent.hidden = isOpen;
        howToToggleBtn.setAttribute('aria-expanded', String(!isOpen));
      });
    }

    const calculatorAssumptionsToggleBtn = qs('calculatorAssumptionsToggleBtn');
    const calculatorAssumptionsContent = qs('calculatorAssumptionsContent');
    if (calculatorAssumptionsToggleBtn && calculatorAssumptionsContent) {
      calculatorAssumptionsToggleBtn.addEventListener('click', function (event) {
        event.preventDefault();
        const isOpen = !calculatorAssumptionsContent.hidden;
        calculatorAssumptionsContent.hidden = isOpen;
        calculatorAssumptionsToggleBtn.setAttribute('aria-expanded', String(!isOpen));
      });
    }


    const showFilmBtn = qs('showFilmBtn');
    const filmModal = qs('filmModal');
    const filmOps = qs('filmOps');
    const filmSub = qs('filmSub');
    const filmStepMeta = qs('filmStepMeta');
    const filmCloseBtn = qs('filmCloseBtn');
    const filmPrevBtn = qs('filmPrevBtn');
    const filmPlayBtn = qs('filmPlayBtn');
    const filmStopBtn = qs('filmStopBtn');
    const filmNextBtn = qs('filmNextBtn');
    const filmPlayIcon = qs('filmPlayIcon');
    const filmPauseIcon = qs('filmPauseIcon');
    const filmBackdrop = filmModal ? filmModal.querySelector('[data-film-close]') : null;
    const instructionVideoBtn = qs('instructionVideoBtn');
    const instructionVideoModal = qs('instructionVideoModal');
    const instructionVideoCloseBtn = qs('instructionVideoCloseBtn');
    const instructionVideoPlayer = qs('instructionVideoPlayer');
    const instructionVideoBackdrop = instructionVideoModal ? instructionVideoModal.querySelector('[data-instruction-video-close]') : null;
    let instructionVideoLastFocused = null;
    const answerInput = qs('patientAnswer');
    const proQuestionsWrap = qs('proQuestionsWrap');
    const stressQuestionWrap = qs('stressQuestionWrap');
    const stressQuestionTitle = qs('stressQuestionTitle');
    const stressQuestionOptions = qs('stressQuestionOptions');
    const stressQuestionHelp = qs('stressQuestionHelp');
    const fatProteinQuestionWrap = qs('fatProteinQuestionWrap');
    const fatProteinQuestionTitle = qs('fatProteinQuestionTitle');
    const fatProteinQuestionOptions = qs('fatProteinQuestionOptions');
    const fatProteinQuestionHelp = qs('fatProteinQuestionHelp');
    const answerFeedback = qs('answerFeedback');
    const solutionCard = qs('solutionCard');
    const taskLead = qs('taskLead');
    const taskNote = qs('taskNote');
    const taskProInfo = qs('taskProInfo');
    const taskMetrics = qs('taskMetrics');
    const taskTitleMeta = qs('taskTitleMeta');
    const rewardLayer = qs('rewardLayer');
    const proToggle = qs('taskModeToggle');
    const proFields = qs('proFields');
    const taskSetupTitle = qs('taskSetupTitle');

    const proExerciseSelect = qs('proExercise');
    const proInfectionSelect = qs('proInfection');
    const proConflictWarning = qs('proConflictWarning');
    const proConflictConfirmBtn = qs('proConflictConfirmBtn');

    const state = {
      currentResult: null,
      solutionVisible: false,
      proConflictConfirmedSignature: ''
    };

    function openLearningModule() {
      if (moduleLauncher) {
        moduleLauncher.hidden = true;
      }
      if (macroContent) {
        macroContent.hidden = true;
      }
      if (calculatorContent) {
        calculatorContent.hidden = true;
      }
      if (moduleContent) {
        moduleContent.hidden = false;
      }
      if (macroLauncherBtn) {
        macroLauncherBtn.setAttribute('aria-expanded', 'false');
      }
      if (calculatorLauncherBtn) {
        calculatorLauncherBtn.setAttribute('aria-expanded', 'false');
      }
      if (moduleLauncherBtn) {
        moduleLauncherBtn.setAttribute('aria-expanded', 'true');
      }
      if (moduleMainHeading && typeof moduleMainHeading.focus === 'function') {
        moduleMainHeading.setAttribute('tabindex', '-1');
        requestAnimationFrame(function () {
          moduleMainHeading.focus({ preventScroll: true });
        });
      }
    }

    function closeLearningModule() {
      closeInstructionVideo(false);
      if (moduleContent) {
        moduleContent.hidden = true;
      }
      if (moduleLauncher) {
        moduleLauncher.hidden = false;
      }
      if (moduleLauncherBtn) {
        moduleLauncherBtn.setAttribute('aria-expanded', 'false');
        if (typeof moduleLauncherBtn.focus === 'function') {
          requestAnimationFrame(function () {
            moduleLauncherBtn.focus({ preventScroll: true });
            if (moduleLauncher && typeof moduleLauncher.scrollIntoView === 'function') {
              moduleLauncher.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          });
        }
      }
    }

    const filmPlayer = createInteractiveFilmPlayer({
      modal: filmModal,
      opsEl: filmOps,
      subEl: filmSub,
      stepMetaEl: filmStepMeta,
      closeBtn: filmCloseBtn,
      backdropEl: filmBackdrop,
      prevBtn: filmPrevBtn,
      playBtn: filmPlayBtn,
      stopBtn: filmStopBtn,
      nextBtn: filmNextBtn,
      playIcon: filmPlayIcon,
      pauseIcon: filmPauseIcon,
      onOpen: () => {
        if (showFilmBtn) {
          showFilmBtn.setAttribute('aria-expanded', 'true');
        }
      },
      onClose: () => {
        if (showFilmBtn) {
          showFilmBtn.setAttribute('aria-expanded', 'false');
        }
      },
      getResult: () => state.currentResult
    });

    function getInstructionVideoSrc() {
      if (instructionVideoBtn && instructionVideoBtn.dataset && instructionVideoBtn.dataset.videoSrc) {
        return instructionVideoBtn.dataset.videoSrc;
      }
      return '/videos/przelicznik_doposilkowy.mp4';
    }

    function closeInstructionVideo(shouldRestoreFocus) {
      const restoreFocus = shouldRestoreFocus !== false;
      if (!instructionVideoModal || !instructionVideoPlayer || instructionVideoModal.hidden) {
        return;
      }

      instructionVideoPlayer.pause();
      try {
        instructionVideoPlayer.currentTime = 0;
      } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('cukrzyca.js', error, { line: 2083 });
    }
  }

      instructionVideoModal.hidden = true;
      instructionVideoModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('diab-instruction-video-open');

      if (instructionVideoBtn) {
        instructionVideoBtn.setAttribute('aria-expanded', 'false');
      }

      if (restoreFocus && instructionVideoLastFocused && typeof instructionVideoLastFocused.focus === 'function') {
        requestAnimationFrame(function () {
          instructionVideoLastFocused.focus({ preventScroll: true });
        });
      }
    }

    function openInstructionVideo() {
      if (!instructionVideoModal || !instructionVideoPlayer) {
        return;
      }

      const source = getInstructionVideoSrc();
      instructionVideoLastFocused = document.activeElement;

      if (instructionVideoPlayer.dataset.loadedSrc !== source) {
        instructionVideoPlayer.src = source;
        instructionVideoPlayer.dataset.loadedSrc = source;
        instructionVideoPlayer.load();
      }

      instructionVideoModal.hidden = false;
      instructionVideoModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('diab-instruction-video-open');

      if (instructionVideoBtn) {
        instructionVideoBtn.setAttribute('aria-expanded', 'true');
      }

      if (instructionVideoCloseBtn && typeof instructionVideoCloseBtn.focus === 'function') {
        requestAnimationFrame(function () {
          instructionVideoCloseBtn.focus({ preventScroll: true });
        });
      }

      const playAttempt = instructionVideoPlayer.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(function (error) {
          diabLogWarn('Autoplay filmu instruktażowego nie został uruchomiony automatycznie.', error, { context: 'instruction-video-autoplay' });
        });
      }
    }

    if (instructionVideoBtn && instructionVideoModal && instructionVideoPlayer) {
      instructionVideoBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openInstructionVideo();
      });

      if (instructionVideoCloseBtn) {
        instructionVideoCloseBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          closeInstructionVideo(true);
        });
      }

      if (instructionVideoBackdrop) {
        instructionVideoBackdrop.addEventListener('click', function () {
          closeInstructionVideo(true);
        });
      }

      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !instructionVideoModal.hidden) {
          event.preventDefault();
          closeInstructionVideo(true);
        }
      });
    }

    bindInactiveSharedButtons();

    if (moduleLauncherBtn && moduleContent) {
      moduleLauncherBtn.addEventListener('click', function (event) {
        event.preventDefault();
        openLearningModule();
      });
    } else if (moduleContent && moduleContent.hidden) {
      moduleContent.hidden = false;
      if (moduleLauncher) {
        moduleLauncher.hidden = true;
      }
    }

    if (moduleBackBtn) {
      moduleBackBtn.addEventListener('click', function (event) {
        event.preventDefault();
        closeLearningModule();
      });
    }

    function showSetupMessage(message) {
      setupStatus.textContent = message;
      setupStatus.hidden = !message;
    }

    function showFeedback(message, success) {
      answerFeedback.hidden = false;
      answerFeedback.className = success ? 'diab-feedback diab-feedback--success' : 'diab-feedback diab-feedback--error';
      diabSetTrustedHtml(answerFeedback, message, 'cukrzyca:learning-feedback');
    }

    function clearProQuestionBlock(wrap, titleElement, optionsElement, helpElement) {
      if (wrap) {
        wrap.hidden = true;
      }
      if (titleElement) {
        titleElement.textContent = '';
      }
      if (optionsElement) {
        diabClearHtml(optionsElement);
      }
      if (helpElement) {
        helpElement.textContent = '';
      }
    }

    function renderProQuestionBlock(question, wrap, titleElement, optionsElement, helpElement) {
      if (!question || !wrap || !optionsElement) {
        clearProQuestionBlock(wrap, titleElement, optionsElement, helpElement);
        return;
      }

      if (titleElement) {
        titleElement.textContent = question.prompt;
      }

      if (helpElement) {
        helpElement.textContent = question.help;
      }

      diabSetTrustedHtml(optionsElement, question.options.map((option) => `
        <label class="diab-pro-option">
          <input type="radio" name="proQuestion_${escapeHtml(question.key)}" value="${escapeHtml(option.key)}">
          <span>${escapeHtml(option.text)}</span>
        </label>
      `).join(''), 'cukrzyca:pro-question-options');

      wrap.hidden = false;
    }

    function renderProQuestions(result) {
      const questions = getActiveProQuestions(result);
      const stressQuestion = questions.find((item) => item.key === 'stress');
      const fatProteinQuestion = questions.find((item) => item.key === 'fatProtein');

      renderProQuestionBlock(stressQuestion, stressQuestionWrap, stressQuestionTitle, stressQuestionOptions, stressQuestionHelp);
      renderProQuestionBlock(fatProteinQuestion, fatProteinQuestionWrap, fatProteinQuestionTitle, fatProteinQuestionOptions, fatProteinQuestionHelp);

      if (proQuestionsWrap) {
        proQuestionsWrap.hidden = !(stressQuestion || fatProteinQuestion);
      }
    }

    function getSelectedQuestionAnswer(questionKey) {
      const checked = document.querySelector(`input[name="proQuestion_${questionKey}"]:checked`);
      return checked ? checked.value : '';
    }

    function focusFirstQuestionOption(questionKey) {
      const firstOption = document.querySelector(`input[name="proQuestion_${questionKey}"]`);
      if (firstOption && typeof firstOption.focus === 'function') {
        firstOption.focus();
      }
    }

    function setSolutionVisibility(visible) {
      state.solutionVisible = Boolean(visible);
      solutionCard.hidden = !state.solutionVisible;
      solutionCard.style.display = state.solutionVisible ? 'grid' : 'none';
      showSolutionBtn.textContent = state.solutionVisible ? 'Ukryj rozwiązanie' : 'Pokaż rozwiązanie krok po kroku';
      showSolutionBtn.setAttribute('aria-expanded', state.solutionVisible ? 'true' : 'false');
    }

    function focusFirstSetupField() {
      const firstField = qs('mealType') || qs('ddi') || qs('carbs');
      if (firstField && typeof firstField.focus === 'function') {
        firstField.focus();
      }
    }


    function getProConflictSignature() {
      const ex = proExerciseSelect ? proExerciseSelect.value : 'none';
      const inf = proInfectionSelect ? proInfectionSelect.value : 'none';
      return `${ex}|${inf}`;
    }

    function hasProExerciseInfectionConflict() {
      if (!(proToggle && proToggle.checked)) return false;
      if (!proExerciseSelect || !proInfectionSelect) return false;
      return proExerciseSelect.value !== 'none' && proInfectionSelect.value !== 'none';
    }

    function updateProConflictUi() {
      const conflict = hasProExerciseInfectionConflict();
      const signature = getProConflictSignature();

      if (!conflict) {
        state.proConflictConfirmedSignature = '';
      } else if (state.proConflictConfirmedSignature && state.proConflictConfirmedSignature !== signature) {
        // Zmieniono wybory -> wymagana ponowna akceptacja
        state.proConflictConfirmedSignature = '';
      }

      const confirmed = conflict && state.proConflictConfirmedSignature === signature;

      if (proConflictWarning) {
        proConflictWarning.hidden = !(conflict && !confirmed);
      }

      if (prepareBtn) {
        prepareBtn.disabled = conflict && !confirmed;
      }
    }

    function confirmProConflict() {
      if (!hasProExerciseInfectionConflict()) {
        state.proConflictConfirmedSignature = '';
        updateProConflictUi();
        return;
      }
      state.proConflictConfirmedSignature = getProConflictSignature();
      updateProConflictUi();
    }

    function updateProModeUi() {
  const enabled = Boolean(proToggle && proToggle.checked);

  if (proFields) {
    proFields.hidden = !enabled;
  }

  if (taskSetupTitle) {
    taskSetupTitle.textContent = enabled ? 'Konfiguracja zadania przez lekarza' : 'Konfiguracja zadania';
  }

  taskSetup.classList.toggle('pro-summary-card', enabled);

  if (!enabled) {
    state.proConflictConfirmedSignature = '';
  }

  updateProConflictUi();
}

    function resetTaskView() {
      state.currentResult = null;
      clearRewardLayer(rewardLayer);
      answerInput.value = '';
      if (proQuestionsWrap) {
        proQuestionsWrap.hidden = true;
      }
      clearProQuestionBlock(stressQuestionWrap, stressQuestionTitle, stressQuestionOptions, stressQuestionHelp);
      clearProQuestionBlock(fatProteinQuestionWrap, fatProteinQuestionTitle, fatProteinQuestionOptions, fatProteinQuestionHelp);
      answerFeedback.hidden = true;
      diabClearHtml(answerFeedback);
      solutionCard.hidden = true;
      solutionCard.style.display = 'none';
      diabClearHtml(solutionCard);
      showSolutionBtn.hidden = true;
      showSolutionBtn.setAttribute('aria-expanded', 'false');
      showSolutionBtn.textContent = 'Pokaż rozwiązanie krok po kroku';
      if (showFilmBtn) {
        showFilmBtn.hidden = true;
        showFilmBtn.setAttribute('aria-expanded', 'false');
      }
      if (filmPlayer && filmPlayer.isOpen) {
        filmPlayer.close(true);
      }
      newTaskBtn.hidden = true;
      state.solutionVisible = false;
      taskArea.classList.remove('pro-summary-card');
      if (taskTitleMeta) {
        taskTitleMeta.textContent = '';
        taskTitleMeta.hidden = true;
      }
      if (taskProInfo) {
        taskProInfo.hidden = true;
        diabClearHtml(taskProInfo);
      }
    }

    function resetLearningModuleForNewPatient() {
      if (doctorForm && typeof doctorForm.reset === 'function') {
        doctorForm.reset();
      }
      if (howToContent) {
        howToContent.hidden = true;
      }
      if (howToToggleBtn) {
        howToToggleBtn.setAttribute('aria-expanded', 'false');
      }
      if (calculatorAssumptionsContent) {
        calculatorAssumptionsContent.hidden = true;
      }
      if (calculatorAssumptionsToggleBtn) {
        calculatorAssumptionsToggleBtn.setAttribute('aria-expanded', 'false');
      }
      closeInstructionVideo(false);
      if (filmPlayer && filmPlayer.isOpen) {
        filmPlayer.close(true);
      }
      resetTaskView();
      taskArea.hidden = true;
      taskSetup.classList.remove('diab-card--muted');
      if (taskLead) {
        diabClearHtml(taskLead);
      }
      if (taskMetrics) {
        diabClearHtml(taskMetrics);
      }
      if (taskNote) {
        diabClearHtml(taskNote);
      }
      if (proToggle) {
        proToggle.checked = false;
      }
      ['proExercise', 'proInfection', 'proStress', 'proFatProtein'].forEach(function (id) {
        const field = qs(id);
        if (field) {
          field.value = 'none';
        }
      });
      const thresholdField = qs('stabilityThreshold');
      if (thresholdField) {
        thresholdField.value = String(STABLE_THRESHOLD_DEFAULT);
      }
      state.proConflictConfirmedSignature = '';
      autoScenarioIndex = 0;
      showSetupMessage('');
      updateProModeUi();
    }

    function renderTask(result) {      if (taskTitleMeta) {
        taskTitleMeta.textContent = '';
        taskTitleMeta.hidden = true;
      }
      diabSetTrustedHtml(taskLead, result.proMode
        ? getProTaskLead(result)
        : 'Korzystając z <strong>zasady L</strong>, oblicz przelicznik doposiłkowy dla tego posiłku <strong>na podstawie danych z dnia poprzedniego</strong>. Końcowy wynik potraktuj jako przelicznik do odpowiedniego posiłku <strong>bieżącego dnia</strong>.', 'cukrzyca:task-lead');

      if (taskProInfo) {
        if (result.proMode) {
          const proInfoHtml = buildProTaskInfo(result);
          if (proInfoHtml) {
            diabSetTrustedHtml(taskProInfo, proInfoHtml, 'cukrzyca:task-pro-info');
            taskProInfo.hidden = false;
          } else {
            diabClearHtml(taskProInfo);
            taskProInfo.hidden = true;
          }
        } else {
          diabClearHtml(taskProInfo);
          taskProInfo.hidden = true;
        }
      }

      renderProQuestions(result);

      renderMetrics(result, taskMetrics);
      taskArea.hidden = false;
      if (showFilmBtn) {
        showFilmBtn.hidden = true;
        showFilmBtn.setAttribute('aria-expanded', 'false');
      }
      taskArea.classList.toggle('pro-summary-card', result.proMode);

      taskArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function collectFormData() {
      const pwzField = qs('pwz');
      return {
        pwz: pwzField ? pwzField.value.trim() : '',
        mealType: qs('mealType').value,
        ddi: parseLocaleNumber(qs('ddi').value),
        carbs: parseLocaleNumber(qs('carbs').value),
        insulinDose: parseLocaleNumber(qs('insulinDose').value),
        glucoseBefore: parseLocaleNumber(qs('glucoseBefore').value),
        glucoseAfter: parseLocaleNumber(qs('glucoseAfter').value),
        threshold: STABLE_THRESHOLD_DEFAULT,
        proMode: Boolean(proToggle && proToggle.checked),
        exerciseMode: qs('proExercise') ? qs('proExercise').value : 'none',
        infectionMode: qs('proInfection') ? qs('proInfection').value : 'none',
        stressMode: qs('proStress') ? qs('proStress').value : 'none',
        fatProteinMode: qs('proFatProtein') ? qs('proFatProtein').value : 'none'
      };
    }

    // --- Generator zadań (automatyczne wypełnianie formularza) ---
    const AUTO_SCENARIOS = ['stable', 'tooLittle', 'tooMuch'];
    let autoScenarioIndex = 0;

    const MEAL_PRESETS = [
      { value: 'śniadanie', carbsMin: 25, carbsMax: 70, baseInsulinMin: 2, baseInsulinMax: 8, ratioMin: 4, ratioMax: 12 },
      { value: 'drugie śniadanie', carbsMin: 15, carbsMax: 40, baseInsulinMin: 1, baseInsulinMax: 5, ratioMin: 4, ratioMax: 12 },
      { value: 'obiad', carbsMin: 30, carbsMax: 90, baseInsulinMin: 3, baseInsulinMax: 10, ratioMin: 4, ratioMax: 12 },
      { value: 'podwieczorek', carbsMin: 10, carbsMax: 35, baseInsulinMin: 1, baseInsulinMax: 4, ratioMin: 4, ratioMax: 12 },
      { value: 'kolacja', carbsMin: 20, carbsMax: 70, baseInsulinMin: 2, baseInsulinMax: 8, ratioMin: 4, ratioMax: 12 },
      { value: 'przekąska', carbsMin: 10, carbsMax: 30, baseInsulinMin: 0.5, baseInsulinMax: 3.5, ratioMin: 4, ratioMax: 12 }
    ];

    function weightedChoice(pairs) {
      const list = Array.isArray(pairs) ? pairs : [];
      const total = list.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
      if (total <= 0) return list.length ? list[list.length - 1].value : null;
      let r = Math.random() * total;
      for (const item of list) {
        r -= Number(item.weight) || 0;
        if (r <= 0) return item.value;
      }
      return list.length ? list[list.length - 1].value : null;
    }

    function generateAutoProModifiers() {
      // Generator w trybie PRO losuje modyfikatory i dodaje je do zadania.
      // Ważne: nigdy nie łączymy jednocześnie planowanego wysiłku i infekcji z gorączką.
      const numericPick = weightedChoice([
        { value: 'none', weight: 0.45 },
        { value: 'exercise', weight: 0.275 },
        { value: 'infection', weight: 0.275 }
      ]);

      let exerciseMode = 'none';
      let infectionMode = 'none';

      if (numericPick === 'exercise') {
        exerciseMode = weightedChoice([
          { value: 'planned25', weight: 0.45 },
          { value: 'planned50', weight: 0.35 },
          { value: 'planned75', weight: 0.20 }
        ]) || 'planned25';
      } else if (numericPick === 'infection') {
        infectionMode = weightedChoice([
          { value: 'fever25', weight: 0.6 },
          { value: 'fever50', weight: 0.4 }
        ]) || 'fever25';
      }

      const stressMode = Math.random() < 0.35 ? 'present' : 'none';
      const fatProteinMode = Math.random() < 0.35 ? 'high' : 'none';

      // Upewnij się, że w trybie PRO jest przynajmniej 1 element PRO do ćwiczenia.
      if (exerciseMode === 'none' && infectionMode === 'none' && stressMode === 'none' && fatProteinMode === 'none') {
        const fallback = weightedChoice([
          { value: 'stress', weight: 0.45 },
          { value: 'fatProtein', weight: 0.35 },
          { value: 'exercise', weight: 0.10 },
          { value: 'infection', weight: 0.10 }
        ]);

        if (fallback === 'stress') {
          return { exerciseMode, infectionMode, stressMode: 'present', fatProteinMode };
        }
        if (fallback === 'fatProtein') {
          return { exerciseMode, infectionMode, stressMode, fatProteinMode: 'high' };
        }
        if (fallback === 'infection') {
          return { exerciseMode: 'none', infectionMode: 'fever25', stressMode, fatProteinMode };
        }
        // default: exercise
        return { exerciseMode: 'planned25', infectionMode: 'none', stressMode, fatProteinMode };
      }

      return { exerciseMode, infectionMode, stressMode, fatProteinMode };
    }

    function randInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randChoice(list) {
      if (!Array.isArray(list) || list.length === 0) return null;
      return list[randInt(0, list.length - 1)];
    }

    function randHalf(min, max) {
      const minInt = Math.ceil(min * 2);
      const maxInt = Math.floor(max * 2);
      if (maxInt < minInt) return NaN;
      return randInt(minInt, maxInt) / 2;
    }

    function toInputString(value, digits) {
      if (!Number.isFinite(value)) return '';
      const fixed = Number(value).toFixed(digits);
      return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
    }

    function getMealPreset(value) {
      return MEAL_PRESETS.find((item) => item.value === value) || null;
    }

    function getSelectedOrRandomMealPreset() {
      const selected = qs('mealType') ? qs('mealType').value : '';
      const fromSelection = selected ? getMealPreset(selected) : null;
      return fromSelection || randChoice(MEAL_PRESETS);
    }

    function buildAllowedAdjustments(sensitivityPractical, threshold, maxUnits, maxDeltaOverride) {
      const allowed = [];
      const minDelta = threshold + 10;
      const maxDeltaBase = 160;
      const maxDelta = Number.isFinite(maxDeltaOverride) ? Math.min(maxDeltaBase, maxDeltaOverride) : maxDeltaBase;
      for (let u = 0.5; u <= maxUnits + 1e-9; u += 0.5) {
        const delta = u * sensitivityPractical;
        const deltaRounded = Math.round(delta);
        const isIntegerDelta = Math.abs(delta - deltaRounded) < 1e-6;
        if (!isIntegerDelta) continue;
        if (deltaRounded < minDelta) continue;
        if (deltaRounded > maxDelta) continue;
        allowed.push(u);
      }
      return allowed;
    }

    function applyGeneratedToForm(data) {
      const setField = (id, value, digits) => {
        const el = qs(id);
        if (!el) return;
        if (typeof digits === 'number') {
          el.value = toInputString(value, digits);
        } else {
          el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };

      setField('mealType', data.mealType);
      setField('ddi', data.ddi, 1);
      setField('carbs', data.carbs, 1);
      setField('insulinDose', data.insulinDose, 1);
      setField('glucoseBefore', data.glucoseBefore, 0);
      setField('glucoseAfter', data.glucoseAfter, 0);

      // PRO selektory: gdy tryb PRO jest włączony, generator wypełnia także modyfikatory PRO.
      if (data.proMode) {
        if (qs('proExercise')) setField('proExercise', data.exerciseMode);
        if (qs('proInfection')) setField('proInfection', data.infectionMode);
        if (qs('proStress')) setField('proStress', data.stressMode);
        if (qs('proFatProtein')) setField('proFatProtein', data.fatProteinMode);
      }
    }

    function generateAutoTaskCandidate(desiredScenario) {
      const usedThreshold = STABLE_THRESHOLD_DEFAULT;
      const mealPreset = getSelectedOrRandomMealPreset();
      if (!mealPreset) return null;

      const proModeEnabled = Boolean(proToggle && proToggle.checked);

      let exerciseMode = 'none';
      let infectionMode = 'none';
      let stressMode = 'none';
      let fatProteinMode = 'none';

      if (proModeEnabled) {
        const currentExercise = qs('proExercise') ? qs('proExercise').value : 'none';
        const currentInfection = qs('proInfection') ? qs('proInfection').value : 'none';
        const currentStress = qs('proStress') ? qs('proStress').value : 'none';
        const currentFatProtein = qs('proFatProtein') ? qs('proFatProtein').value : 'none';

        const hasAnyModifier =
          currentExercise !== 'none' ||
          currentInfection !== 'none' ||
          currentStress !== 'none' ||
          currentFatProtein !== 'none';

        if (hasAnyModifier) {
          // Jeśli lekarz wybrał konkretne modyfikatory, generator zachowuje ten wybór
          // i generuje tylko liczby do zadania (bez losowej zmiany modyfikatorów).
          exerciseMode = currentExercise;
          infectionMode = currentInfection;
          stressMode = currentStress;
          fatProteinMode = currentFatProtein;
        } else {
          // Jeśli nic nie wybrano, generator dobiera modyfikatory PRO automatycznie (bez łączenia wysiłku i infekcji).
          const proAuto = generateAutoProModifiers();
          exerciseMode = proAuto.exerciseMode;
          infectionMode = proAuto.infectionMode;
          stressMode = proAuto.stressMode;
          fatProteinMode = proAuto.fatProteinMode;
        }
      }

      // DDI (praktyczne, realne zakresy)
      const ddi = randHalf(18, 70);
      if (!Number.isFinite(ddi) || ddi <= 0) return null;

      const sensitivityExact = 1800 / ddi;
      const sensitivityPractical = roundToNearestFiveHalfDown(sensitivityExact);
      if (!Number.isFinite(sensitivityPractical) || sensitivityPractical <= 0) return null;

      // Dobieramy parę (insulina na posiłek) + (ICR g/j), aby węglowodany wyszły realnie dla danego posiłku.
      let baseMealInsulin = NaN;
      let ratioWanted = NaN;
      let carbs = NaN;

      let pairFound = false;

      for (let attempt = 0; attempt < 40; attempt += 1) {
        ratioWanted = randInt(mealPreset.ratioMin, mealPreset.ratioMax);
        baseMealInsulin = randHalf(mealPreset.baseInsulinMin, mealPreset.baseInsulinMax);
        if (!Number.isFinite(baseMealInsulin) || baseMealInsulin <= 0) continue;
        carbs = Math.round(baseMealInsulin * ratioWanted * 10) / 10;
        if (carbs < mealPreset.carbsMin || carbs > mealPreset.carbsMax) continue;
        // dodatkowy bezpieczny limit (żeby zadania były czytelne)
        if (carbs < 10 || carbs > 110) continue;
        pairFound = true;
        break;
      }

      if (!pairFound) return null;
      if (!Number.isFinite(baseMealInsulin) || !Number.isFinite(carbs) || carbs <= 0) return null;

      // Ustalamy glikemie oraz dawkę podaną zgodnie z wybranym scenariuszem.
      // Ograniczenia generatora: glikemia przed posiłkiem 70–140 mg/dl,
      // a glikemia 2–3 h po posiłku 70–180 mg/dl (realne zakresy do ćwiczeń).
      const requiresExerciseRange = proModeEnabled && exerciseMode !== 'none';
      const beforeMinBase = requiresExerciseRange ? 100 : 70;
      const beforeMaxBase = 140;

      let insulinDose = baseMealInsulin;
      let glucoseBefore = NaN;
      let glucoseAfter = NaN;

      if (desiredScenario === 'stable') {
        // stabilnie: różnica <= próg
        const possibleDeltaAbs = [];
        for (let d = 0; d <= usedThreshold; d += 5) {
          possibleDeltaAbs.push(d);
        }
        const deltaAbs = randChoice(possibleDeltaAbs);
        const sign = Math.random() < 0.5 ? -1 : 1;
        const delta = sign * (Number.isFinite(deltaAbs) ? deltaAbs : 0);

        for (let attempt = 0; attempt < 30; attempt += 1) {
          const beforeMin = Math.max(beforeMinBase, 70 - delta);
          const beforeMax = Math.min(beforeMaxBase, 180 - delta);
          if (beforeMax < beforeMin) continue;
          const before = randInt(beforeMin, beforeMax);
          const after = before + delta;
          if (after < 70 || after > 180) continue;
          glucoseBefore = before;
          glucoseAfter = after;
          break;
        }
      } else if (desiredScenario === 'tooLittle') {
        // za mało insuliny: po posiłku wzrost > próg
        const maxUnits = Math.min(4, Math.max(0.5, baseMealInsulin - 0.5));
        const maxDeltaAllowed = 180 - beforeMinBase;
        const allowedUnits = buildAllowedAdjustments(sensitivityPractical, usedThreshold, maxUnits, maxDeltaAllowed);
        const missingUnits = randChoice(allowedUnits);
        if (!Number.isFinite(missingUnits)) return null;

        insulinDose = baseMealInsulin - missingUnits;
        if (!Number.isFinite(insulinDose) || insulinDose <= 0) return null;

        const deltaAbs = Math.round(missingUnits * sensitivityPractical);
        const beforeMax = Math.min(beforeMaxBase, 180 - deltaAbs);
        const beforeMin = beforeMinBase;
        if (beforeMax < beforeMin) return null;

        glucoseBefore = randInt(beforeMin, beforeMax);
        glucoseAfter = glucoseBefore + deltaAbs;
      } else {
        // tooMuch: za dużo insuliny / część poszła na korektę (spadek > próg)
        const maxUnits = 3.5;
        const maxDeltaAllowed = beforeMaxBase - 70;
        const allowedUnits = buildAllowedAdjustments(sensitivityPractical, usedThreshold, maxUnits, maxDeltaAllowed);
        const excessUnits = randChoice(allowedUnits);
        if (!Number.isFinite(excessUnits)) return null;

        insulinDose = baseMealInsulin + excessUnits;
        const deltaAbs = Math.round(excessUnits * sensitivityPractical);

        const beforeMin = Math.max(beforeMinBase, 70 + deltaAbs);
        const beforeMax = beforeMaxBase;
        if (beforeMin > beforeMax) return null;

        glucoseBefore = randInt(beforeMin, beforeMax);
        glucoseAfter = glucoseBefore - deltaAbs;
        if (glucoseAfter < 70) return null;
      }

      if (!Number.isFinite(glucoseBefore) || !Number.isFinite(glucoseAfter)) return null;
      // Twarde ograniczenia generatora (realne zakresy do ćwiczeń):
      // glikemia przed posiłkiem 70–140 mg/dl, glikemia 2–3 h po posiłku 70–180 mg/dl.
      if (glucoseBefore < 70 || glucoseBefore > 140) return null;
      if (glucoseAfter < 70 || glucoseAfter > 180) return null;


      const candidate = {
        pwz: '',
        mealType: mealPreset.value,
        ddi,
        carbs,
        insulinDose,
        glucoseBefore,
        glucoseAfter,
        threshold: usedThreshold,
        proMode: proModeEnabled,
        exerciseMode,
        infectionMode,
        stressMode,
        fatProteinMode
      };

      // Sprawdzamy logikę przez istniejący silnik (to też dba o spójność korekty).
      const result = computeScenario(candidate);
      if (!result.ok) return null;
      if (result.scenarioType !== desiredScenario) return null;

      // ograniczenie „realności” przelicznika
      if (!Number.isFinite(result.ratioRounded) || result.ratioRounded < 2 || result.ratioRounded > 25) return null;

      // Jeżeli PRO + wysiłek, trzymamy warunek edukacyjny (100–250).
      if (proModeEnabled && exerciseMode !== 'none' && (glucoseBefore < 100 || glucoseBefore > 250)) return null;

      return candidate;
    }

    function generateAndPrepareAutoTask() {
      if (!prepareBtn) return;
      showSetupMessage('');

      const desiredScenario = AUTO_SCENARIOS[autoScenarioIndex % AUTO_SCENARIOS.length];
      autoScenarioIndex += 1;

      // W trybie PRO generator nie tworzy zadań z jednoczesnym wysiłkiem i infekcją.
      // Jeśli ktoś zaznaczył oba modyfikatory ręcznie, prosimy o zmianę wyboru.
      const proModeEnabled = Boolean(proToggle && proToggle.checked);
      if (proModeEnabled) {
        const ex = qs('proExercise') ? qs('proExercise').value : 'none';
        const inf = qs('proInfection') ? qs('proInfection').value : 'none';
        if (ex !== 'none' && inf !== 'none') {
          showSetupMessage('Generator w trybie profesjonalnym nie tworzy zadań z jednoczesnym planowanym wysiłkiem i infekcją z gorączką. Usuń jeden z tych modyfikatorów (albo przygotuj takie zadanie ręcznie, po potwierdzeniu ostrzeżenia).');
          return;
        }
      }


      let candidate = null;
      for (let attempt = 0; attempt < 250; attempt += 1) {
        candidate = generateAutoTaskCandidate(desiredScenario);
        if (candidate) break;
      }

      if (!candidate) {
        showSetupMessage('Nie udało się wygenerować logicznego zadania w tym zestawie ustawień. Zmień rodzaj posiłku albo (w PRO) modyfikatory i spróbuj ponownie.');
        return;
      }

      applyGeneratedToForm(candidate);

      // Od razu przygotowujemy zadanie dla pacjenta.
      prepareBtn.click();
    }

    if (generateBtn) {
      generateBtn.addEventListener('click', function (event) {
        event.preventDefault();
        resetTaskView();
        taskArea.hidden = true;
        taskSetup.classList.remove('diab-card--muted');
        updateProModeUi();
        generateAndPrepareAutoTask();
      });
    }

    prepareBtn.addEventListener('click', function (event) {
      event.preventDefault();
      showSetupMessage('');
      resetTaskView();
      taskArea.hidden = true;
      taskSetup.classList.remove('diab-card--muted');
      updateProModeUi();

      const data = collectFormData();

      if (!data.mealType) {
        showSetupMessage('Wybierz rodzaj posiłku.');
        return;
      }

      if ([data.ddi, data.carbs, data.insulinDose, data.glucoseBefore, data.glucoseAfter].some((value) => !Number.isFinite(value))) {
        showSetupMessage('Uzupełnij wszystkie pola liczbowe.');
        return;
      }

      if (data.ddi <= 0 || data.carbs <= 0 || data.insulinDose <= 0) {
        showSetupMessage('DDI, węglowodany i dawka insuliny muszą być większe od zera.');
        return;
      }

      if (data.glucoseBefore < 20 || data.glucoseAfter < 20) {
        showSetupMessage('Podane glikemie są zbyt niskie, żeby przygotować wiarygodne zadanie.');
        return;
      }

      if (data.glucoseBefore < 70) {
        showSetupMessage('Jeśli glikemia przed posiłkiem jest poniżej 70 mg/dl, najpierw trzeba leczyć hipoglikemię. Do tego ćwiczenia ustaw glikemię przed posiłkiem co najmniej 70 mg/dl.');
        return;
      }

      if (data.proMode && data.exerciseMode !== 'none' && (data.glucoseBefore < 100 || data.glucoseBefore > 250)) {
        showSetupMessage('Dla planowanego wysiłku to ćwiczenie zakłada glikemię przed aktywnością w zakresie 100–250 mg/dl. Przy wartościach <100 mg/dl zwykle najpierw zabezpiecza się wysiłek dodatkowymi węglowodanami bez insuliny, a przy >250 mg/dl warto sprawdzić ketony i wyrównać hiperglikemię. Dlatego w tym zadaniu ustaw glikemię w zakresie 100–250 mg/dl.');
        return;
      }

      const result = computeScenario(data);
      if (!result.ok) {
        showSetupMessage(result.message);
        return;
      }

      state.currentResult = result;
      renderTask(result);
      taskSetup.classList.add('diab-card--muted');
      answerInput.focus();
    });

    submitBtn.addEventListener('click', function (event) {
      event.preventDefault();
      if (!state.currentResult) return;

      const answer = parseLocaleNumber(answerInput.value);
      if (!Number.isFinite(answer)) {
        showFeedback('Wpisz wynik liczbowy, np. <strong>7,5</strong> albo <strong>8</strong>.', false);
        return;
      }

      const numericCorrect = isAnswerCorrect(answer, state.currentResult);
      const activeQuestions = getActiveProQuestions(state.currentResult);
      const questionEvaluations = activeQuestions.map((question) => {
        const selected = getSelectedQuestionAnswer(question.key);
        return {
          question,
          selected,
          answered: Boolean(selected),
          correct: selected === question.correctOptionKey
        };
      });

      const unansweredQuestion = questionEvaluations.find((item) => !item.answered);
      if (unansweredQuestion) {
        showFeedback(`W wersji PRO zaznacz jeszcze odpowiedź w ${escapeHtml(unansweredQuestion.question.feedbackLabel)}.`, false);
        focusFirstQuestionOption(unansweredQuestion.question.key);
        return;
      }

      const questionsCorrect = questionEvaluations.every((item) => item.correct);
      const fullyCorrect = numericCorrect && questionsCorrect;
      const correctRatioFragment = buildCorrectRatioFragment(state.currentResult);

      if (fullyCorrect) {
        const questionSuccessText = questionEvaluations.length
          ? ` ${questionEvaluations.map((item) => formatCorrectAnswerShort(item)).join(' ')}`
          : '';

        showFeedback(
          state.currentResult.proMode
            ? `Brawo. Wynik PRO jest poprawny. Prawidłowy przelicznik wynosi ${correctRatioFragment}.${questionSuccessText}`
            : `Brawo. Wynik jest poprawny. Prawidłowy przelicznik wynosi ${correctRatioFragment}.`,
          true
        );
        celebrateSuccess(rewardLayer);
      } else {
        clearRewardLayer(rewardLayer);

        const parts = [];

        if (!state.currentResult.proMode) {
          parts.push(`To nie jest prawidłowy wynik. Prawidłowy przelicznik to ${correctRatioFragment}.`);
        } else {
          if (numericCorrect && !questionsCorrect) {
            parts.push('Wynik liczbowy jest poprawny, ale nie wszystkie odpowiedzi PRO są jeszcze prawidłowe.');
          } else if (!numericCorrect && questionsCorrect) {
            parts.push(questionEvaluations.length > 0 ? 'Odpowiedzi PRO są poprawne, ale wynik liczbowy nie jest jeszcze poprawny.' : 'Wynik liczbowy nie jest jeszcze poprawny.');
          } else if (!numericCorrect && !questionsCorrect) {
            parts.push(questionEvaluations.length > 0 ? 'Wynik liczbowy i część odpowiedzi PRO nie są jeszcze poprawne.' : 'Wynik liczbowy nie jest jeszcze poprawny.');
          }

          if (!numericCorrect) {
            parts.push(`Prawidłowy przelicznik to ${correctRatioFragment}.`);
          }

          questionEvaluations.filter((item) => !item.correct).forEach((item) => {
            parts.push(formatCorrectAnswerWithExplanation(item));
          });
        }

        parts.push('Poniżej masz pełne rozwiązanie krok po kroku.');
        showFeedback(parts.join(' '), false);
      }

      diabSetTrustedHtml(solutionCard, buildSolutionHtml(state.currentResult), 'cukrzyca:solution-card');
      showSolutionBtn.hidden = false;
      if (showFilmBtn) {
        showFilmBtn.hidden = false;
        showFilmBtn.setAttribute('aria-expanded', 'false');
      }

      setSolutionVisibility(!fullyCorrect);
      newTaskBtn.hidden = false;
    });

    showSolutionBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!state.currentResult) return;
      if (!String(solutionCard.textContent || '').trim()) {
        diabSetTrustedHtml(solutionCard, buildSolutionHtml(state.currentResult), 'cukrzyca:solution-card');
      }
      setSolutionVisibility(!state.solutionVisible);
    });


    if (showFilmBtn) {
      showFilmBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!state.currentResult) return;
        filmPlayer.open();
      });
    }


    newTaskBtn.addEventListener('click', function (event) {
      event.preventDefault();
      resetTaskView();
      taskArea.hidden = true;
      taskSetup.classList.remove('diab-card--muted');
      updateProModeUi();
      showSetupMessage('Możesz zmienić parametry i przygotować kolejne zadanie.');
      focusFirstSetupField();
    });

    doctorForm.addEventListener('submit', function (event) {
      event.preventDefault();
      prepareBtn.click();
    });

    answerInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitBtn.click();
      }
    });

    if (proToggle) {
      proToggle.addEventListener('change', function () {
        updateProModeUi();
        resetTaskView();
        taskArea.hidden = true;
        taskSetup.classList.remove('diab-card--muted');
        showSetupMessage('');
      });
    }

    if (proExerciseSelect) {
      proExerciseSelect.addEventListener('change', function () {
        updateProConflictUi();
      });
    }

    if (proInfectionSelect) {
      proInfectionSelect.addEventListener('change', function () {
        updateProConflictUi();
      });
    }

    if (proConflictConfirmBtn) {
      proConflictConfirmBtn.addEventListener('click', function (event) {
        event.preventDefault();
        confirmProConflict();
      });
    }

    window.addEventListener(CLEAR_ALL_EVENT, function () {
      resetLearningModuleForNewPatient();
    });

    updateProModeUi();
  }


  window.diabMealRatioToolkit = {
    computeScenario: computeScenario,
    parseLocaleNumber: parseLocaleNumber,
    formatNumber: formatNumber,
    capitalizeFirst: capitalizeFirst,
    stableThresholdDefault: STABLE_THRESHOLD_DEFAULT
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


(function () {
  'use strict';

  const STORAGE_KEY = 'wagaiwzrost_cukrzyca_przeliczniki_doposilkowe_v1';

  function qs(id) {
    return document.getElementById(id);
  }

  function parseLocaleNumberLocal(value) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
    return normalized === '' ? NaN : Number(normalized);
  }

  function formatNumberLocal(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits
    }).format(value);
  }

  function capitalizeFirstLocal(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function escapeHtml(value) {
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.escapeHtml === 'function') {
      return window.VildaHtml.escapeHtml(value);
    }
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toLocalDateValue(date) {
    const value = date instanceof Date ? new Date(date.getTime()) : new Date();
    const offset = value.getTimezoneOffset() * 60000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 10);
  }

  function getTodayDateValue() {
    return toLocalDateValue(new Date());
  }

  function getYesterdayDateValue() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return toLocalDateValue(yesterday);
  }

  function normalizeDateValue(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : getYesterdayDateValue();
  }

  function formatDateLabel(value) {
    const normalized = normalizeDateValue(value);
    const parts = normalized.split('-').map((item) => Number(item));
    const date = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    return new Intl.DateTimeFormat('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function roundToStepLocal(value, step) {
    if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
    return Math.round(value / step) * step;
  }

  function roundToNearestFiveHalfDownLocal(value) {
    if (!Number.isFinite(value)) return NaN;
    const step = 5;
    const lower = Math.floor(value / step) * step;
    const remainder = value - lower;
    const rounded = remainder <= step / 2 ? lower : lower + step;
    return Math.max(step, rounded);
  }

  function classifyDeltaLocal(delta, threshold) {
    if (Math.abs(delta) <= threshold) return 'stable';
    return delta > 0 ? 'tooLittle' : 'tooMuch';
  }

  function getSensitivityExactFromDdi(ddi) {
    return Number.isFinite(ddi) && ddi > 0 ? 1800 / ddi : NaN;
  }

  function getSensitivityPracticalFromDdi(ddi) {
    const exact = getSensitivityExactFromDdi(ddi);
    return Number.isFinite(exact) ? roundToNearestFiveHalfDownLocal(exact) : NaN;
  }

  function getScenarioChipModifierLocal(type) {
    switch (type) {
      case 'stable':
        return 'stable';
      case 'tooLittle':
        return 'warn';
      case 'tooMuch':
        return 'danger';
      default:
        return 'stable';
    }
  }

  function deriveEntryMetrics(entry, thresholdFallback) {
    const source = isPlainObject(entry) ? entry : {};
    const threshold = Number.isFinite(source.threshold) ? Number(source.threshold) : thresholdFallback;
    const ddi = Number(source.ddi);
    const carbs = Number(source.carbs);
    const insulinDose = Number(source.insulinDose);
    const glucoseBefore = Number(source.glucoseBefore);
    const glucoseAfter = Number(source.glucoseAfter);
    const delta = Number.isFinite(source.delta)
      ? Number(source.delta)
      : (Number.isFinite(glucoseAfter) && Number.isFinite(glucoseBefore) ? glucoseAfter - glucoseBefore : NaN);
    const scenarioType = typeof source.scenarioType === 'string' && source.scenarioType
      ? source.scenarioType
      : (Number.isFinite(delta) ? classifyDeltaLocal(delta, threshold) : 'stable');
    const sensitivityExact = Number.isFinite(source.sensitivityExact)
      ? Number(source.sensitivityExact)
      : getSensitivityExactFromDdi(ddi);
    const sensitivityPractical = Number.isFinite(source.sensitivityPractical)
      ? Number(source.sensitivityPractical)
      : getSensitivityPracticalFromDdi(ddi);

    let adjustmentRounded = Number.isFinite(source.adjustmentRounded) ? Number(source.adjustmentRounded) : NaN;
    if (!Number.isFinite(adjustmentRounded)) {
      adjustmentRounded = scenarioType === 'stable' || !Number.isFinite(delta) || !Number.isFinite(sensitivityPractical) || sensitivityPractical <= 0
        ? 0
        : roundToStepLocal(Math.abs(delta) / sensitivityPractical, 0.5);
    }

    let mealInsulin = Number.isFinite(source.mealInsulin) ? Number(source.mealInsulin) : NaN;
    if (!Number.isFinite(mealInsulin)) {
      if (scenarioType === 'tooLittle') {
        mealInsulin = insulinDose + adjustmentRounded;
      } else if (scenarioType === 'tooMuch') {
        mealInsulin = insulinDose - adjustmentRounded;
      } else {
        mealInsulin = insulinDose;
      }
    }

    const ratioExact = Number.isFinite(source.ratioExact)
      ? Number(source.ratioExact)
      : (Number.isFinite(carbs) && Number.isFinite(mealInsulin) && mealInsulin > 0 ? carbs / mealInsulin : NaN);
    const ratioRounded = Number.isFinite(source.ratioRounded)
      ? Number(source.ratioRounded)
      : (Number.isFinite(ratioExact) ? Math.max(1, Math.round(ratioExact)) : NaN);

    return Object.assign({}, source, {
      threshold,
      ddi,
      carbs,
      insulinDose,
      glucoseBefore,
      glucoseAfter,
      delta,
      scenarioType,
      sensitivityExact,
      sensitivityPractical,
      adjustmentRounded,
      mealInsulin,
      ratioExact,
      ratioRounded
    });
  }

  function getDaySensitivityInfo(entries) {
    if (!Array.isArray(entries) || !entries.length) {
      return null;
    }

    const ddiMap = new Map();
    entries.forEach((entry) => {
      const ddi = Number(entry && entry.ddi);
      if (!Number.isFinite(ddi) || ddi <= 0) return;
      ddiMap.set(ddi.toFixed(3), ddi);
    });

    const ddiValues = Array.from(ddiMap.values());
    if (!ddiValues.length) {
      return null;
    }

    if (ddiValues.length === 1) {
      const ddi = ddiValues[0];
      return {
        consistent: true,
        ddi,
        sensitivityExact: getSensitivityExactFromDdi(ddi),
        sensitivityPractical: getSensitivityPracticalFromDdi(ddi)
      };
    }

    return {
      consistent: false,
      ddiValues: ddiValues.sort((a, b) => a - b)
    };
  }

  function buildSensitivitySummaryParts(info, dateLabel, formatNumberFn) {
    const formatNumberSafe = typeof formatNumberFn === 'function' ? formatNumberFn : formatNumberLocal;
    if (!info) {
      return null;
    }

    if (info.consistent) {
      const exactText = formatNumberSafe(info.sensitivityExact, 2);
      const practicalText = formatNumberSafe(info.sensitivityPractical, 0);
      const ddiText = formatNumberSafe(info.ddi, 1);
      const useApprox = Number.isFinite(info.sensitivityExact) && Number.isFinite(info.sensitivityPractical)
        ? Math.abs(info.sensitivityExact - info.sensitivityPractical) >= 0.01
        : false;
      return {
        mainText: `Insulinowrażliwość: w dniu ${dateLabel} - 1 jednostka insuliny obniżała glikemię o ${exactText} mg/dl ze wzoru 1800/DDI.`,
        noteText: `Praktycznie do obliczeń odpowiada to ${useApprox ? 'około ' : ''}${practicalText} mg/dl (DDI = ${ddiText} j).`
      };
    }

    const ddiList = info.ddiValues.map((value) => `${formatNumberSafe(value, 1)} j`).join('; ');
    return {
      mainText: `Insulinowrażliwość: w zapisach dla dnia ${dateLabel} występują różne wartości DDI, więc nie można pokazać jednej wspólnej insulinowrażliwości dla całego dnia.`,
      noteText: `Zapisane DDI: ${ddiList}.`
    };
  }

  function getInsulinBalanceInfo(entry, formatNumberFn) {
    const formatNumberSafe = typeof formatNumberFn === 'function' ? formatNumberFn : formatNumberLocal;
    const insulinDoseText = formatNumberSafe(entry.insulinDose, 1);
    const mealInsulinText = formatNumberSafe(entry.mealInsulin, 1);
    const adjustmentText = formatNumberSafe(entry.adjustmentRounded, 1);

    if (entry.scenarioType === 'tooLittle') {
      return {
        chipModifier: getScenarioChipModifierLocal(entry.scenarioType),
        chipLabel: 'Za mało insuliny',
        mainText: `Podano ${insulinDoseText} j, ale zabrakło ${adjustmentText} j. Łącznie na posiłek powinno było pójść ${mealInsulinText} j.`,
        subText: 'To znaczy, że podanej insuliny było za mało w stosunku do posiłku.'
      };
    }

    if (entry.scenarioType === 'tooMuch') {
      return {
        chipModifier: getScenarioChipModifierLocal(entry.scenarioType),
        chipLabel: 'Za dużo insuliny',
        mainText: `Podano ${insulinDoseText} j, ale na posiłek poszły tylko ${mealInsulinText} j, a ${adjustmentText} j było za dużo / stanowiło korektę.`,
        subText: 'To znaczy, że część dawki nie była potrzebna na samo jedzenie.'
      };
    }

    return {
      chipModifier: getScenarioChipModifierLocal(entry.scenarioType),
      chipLabel: 'Dawka dobrze dobrana',
      mainText: `Podano ${insulinDoseText} j i dawka była dobrze dobrana do posiłku. Całe ${mealInsulinText} j poszło na posiłek.`,
      subText: 'Glikemia po 2–3 h pozostała stabilna w stosunku do pomiaru przed posiłkiem.'
    };
  }

  function buildInsulinBalancePlainText(entry, formatNumberFn) {
    const balance = getInsulinBalanceInfo(entry, formatNumberFn);
    const parts = [balance.chipLabel, balance.mainText, balance.subText].filter(Boolean);
    return parts.join(' ');
  }

  function createEmptyStore() {
    return {
      version: 1,
      days: {}
    };
  }

  function normalizeStore(raw) {
    const store = createEmptyStore();

    if (!isPlainObject(raw) || !isPlainObject(raw.days)) {
      return store;
    }

    Object.keys(raw.days).forEach((dateValue) => {
      const normalizedDate = normalizeDateValue(dateValue);
      const day = raw.days[dateValue];
      if (!isPlainObject(day) || !isPlainObject(day.meals)) return;

      const meals = {};
      Object.keys(day.meals).forEach((mealType) => {
        const entry = day.meals[mealType];
        if (!isPlainObject(entry)) return;
        meals[mealType] = Object.assign({}, entry, {
          mealType: entry.mealType || mealType,
          date: normalizeDateValue(entry.date || normalizedDate)
        });
      });

      store.days[normalizedDate] = {
        date: normalizedDate,
        updatedAt: typeof day.updatedAt === 'string' ? day.updatedAt : '',
        meals: meals
      };
    });

    return store;
  }

  function loadStore() {
    try {
      const parsed = window.vildaDiabetesPersistence
        ? window.vildaDiabetesPersistence.readJSON('DIABETES_MEAL_RATIOS', null)
        : null;
      if (!parsed) return createEmptyStore();
      return normalizeStore(parsed);
    } catch (error) {
      return createEmptyStore();
    }
  }

  function saveStore(store) {
    try {
      if (window.vildaDiabetesPersistence) {
        return window.vildaDiabetesPersistence.writeJSON('DIABETES_MEAL_RATIOS', store);
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  function sanitizePdfText(value) {
    return String(value == null ? '' : value).replace(/\r?\n+/g, ' ').trim();
  }

  function fitCanvasText(ctx, text, maxWidth) {
    const safeText = sanitizePdfText(text);
    if (!safeText) return '';
    if (!Number.isFinite(maxWidth) || maxWidth <= 0 || ctx.measureText(safeText).width <= maxWidth) {
      return safeText;
    }

    const ellipsis = '…';
    let end = safeText.length;

    while (end > 0) {
      const candidate = `${safeText.slice(0, end).trimEnd()}${ellipsis}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        return candidate;
      }
      end -= 1;
    }

    return ellipsis;
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const safeText = sanitizePdfText(text);
    if (!safeText) return [''];
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return [safeText];

    const words = safeText.split(/\s+/);
    const lines = [];
    let currentLine = '';

    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (!currentLine || ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
        return;
      }

      lines.push(currentLine);

      if (ctx.measureText(word).width <= maxWidth) {
        currentLine = word;
        return;
      }

      let chunk = '';
      Array.from(word).forEach((char) => {
        const nextChunk = `${chunk}${char}`;
        if (!chunk || ctx.measureText(nextChunk).width <= maxWidth) {
          chunk = nextChunk;
        } else {
          lines.push(chunk);
          chunk = char;
        }
      });
      currentLine = chunk;
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length ? lines : [''];
  }

  function drawCanvasParagraph(ctx, text, x, y, maxWidth, options) {
    const opts = options || {};
    const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : 24;
    const lineHeight = Number.isFinite(opts.lineHeight) ? opts.lineHeight : Math.round(fontSize * 1.35);
    const fontWeight = opts.fontWeight || 'normal';
    const align = opts.align || 'left';
    const color = opts.color || '#212b36';
    const fontFamily = opts.fontFamily || 'Arial, Helvetica, sans-serif';
    const drawX = align === 'center' ? x + (maxWidth / 2) : align === 'right' ? x + maxWidth : x;

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const lines = wrapCanvasText(ctx, text, maxWidth);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    lines.forEach((line, index) => {
      ctx.fillText(line, drawX, y + (index * lineHeight));
    });
    ctx.restore();

    return lines.length * lineHeight;
  }

  function drawPdfCanvasCell(ctx, x, y, width, height, text, options) {
    const opts = options || {};
    const fill = opts.fill || '#ffffff';
    const stroke = opts.draw || '#becdcd';
    const textColor = opts.textColor || '#212b36';
    const align = opts.align || 'left';
    const fontWeight = opts.fontWeight || 'normal';
    const fontSize = Number.isFinite(opts.fontSize) ? opts.fontSize : 24;
    const lineWidth = Number.isFinite(opts.lineWidth) ? opts.lineWidth : 2;
    const paddingX = Number.isFinite(opts.paddingX) ? opts.paddingX : 14;
    const fontFamily = opts.fontFamily || 'Arial, Helvetica, sans-serif';
    const maxTextWidth = Math.max(0, width - (paddingX * 2));

    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';
    ctx.textBaseline = 'middle';

    const safeText = fitCanvasText(ctx, text, maxTextWidth);
    let textX = x + paddingX;

    if (align === 'right') {
      textX = x + width - paddingX;
    } else if (align === 'center') {
      textX = x + (width / 2);
    }

    ctx.fillText(safeText, textX, y + (height / 2), maxTextWidth);
    ctx.restore();
  }

  function buildRatioPdfCanvas(entries, dateLabel, threshold, formatNumberFn, capitalizeFirstFn) {
    if (!Array.isArray(entries) || !entries.length || typeof document === 'undefined') {
      return null;
    }

    const formatNumberSafe = typeof formatNumberFn === 'function' ? formatNumberFn : formatNumberLocal;
    const capitalizeFirstSafe = typeof capitalizeFirstFn === 'function' ? capitalizeFirstFn : capitalizeFirstLocal;

    const PX_PER_MM = 9;
    const pageWidthMm = 297;
    const pageHeightMm = 210;
    const mm = function (value) {
      return Math.round(value * PX_PER_MM);
    };
    const canvas = document.createElement('canvas');
    canvas.width = mm(pageWidthMm);
    canvas.height = mm(pageHeightMm);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    const fontFamily = 'Arial, Helvetica, sans-serif';
    const marginX = mm(10);
    const pageContentWidth = canvas.width - (marginX * 2);
    const rowHeight = mm(8);
    const gridColor = '#becdcd';
    const headerFill = '#eef7f7';
    const headerText = '#005f66';
    const bodyText = '#212b36';
    const highlightBorder = '#7c3aed';
    const highlightFill = '#f5f3ff';
    const highlightText = '#5b21b6';
    const columns = [
      { key: 'meal', label: 'Posiłek', width: mm(34), bodyAlign: 'left' },
      { key: 'ddi', label: 'DDI [j.]', width: mm(19), bodyAlign: 'right' },
      { key: 'carbs', label: 'Węglowodany [g]', width: mm(27), bodyAlign: 'right' },
      { key: 'insulinDose', label: 'Insulina [j.]', width: mm(24), bodyAlign: 'right' },
      { key: 'glucoseBefore', label: 'Glikemia przed [mg/dl]', width: mm(38), bodyAlign: 'right' },
      { key: 'glucoseAfter', label: 'Glikemia po 2–3 h [mg/dl]', width: mm(41), bodyAlign: 'right' },
      { key: 'ratioRounded', label: 'Przelicznik praktyczny [g/j]', width: mm(48), bodyAlign: 'right', highlight: true },
      { key: 'ratioExact', label: 'Przelicznik dokładny [g/j]', width: mm(36), bodyAlign: 'right' }
    ];
    const bodyRows = entries.map((entry) => ({
      meal: capitalizeFirstSafe(entry.mealType),
      ddi: formatNumberSafe(entry.ddi, 1),
      carbs: formatNumberSafe(entry.carbs, 1),
      insulinDose: formatNumberSafe(entry.insulinDose, 1),
      glucoseBefore: formatNumberSafe(entry.glucoseBefore, 0),
      glucoseAfter: formatNumberSafe(entry.glucoseAfter, 0),
      ratioRounded: formatNumberSafe(entry.ratioRounded, 0),
      ratioExact: formatNumberSafe(entry.ratioExact, 2)
    }));

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let y = mm(12);
    y += drawCanvasParagraph(ctx, 'Kalkulator przeliczników doposiłkowych', marginX, y, pageContentWidth, {
      fontSize: 63,
      fontWeight: 'bold',
      color: '#172222',
      fontFamily: fontFamily
    });
    y += mm(2.2);
    y += drawCanvasParagraph(ctx, `Obliczenia dla dnia: ${dateLabel}`, marginX, y, pageContentWidth, {
      fontSize: 33,
      color: bodyText,
      fontFamily: fontFamily
    });
    y += mm(0.8);
    y += drawCanvasParagraph(ctx, `Liczysz z wczoraj, stosujesz dziś. Próg stabilnej różnicy glikemii: ±${threshold} mg/dl.`, marginX, y, pageContentWidth, {
      fontSize: 30,
      color: bodyText,
      fontFamily: fontFamily
    });
    y += mm(3);

    let x = marginX;
    columns.forEach((column) => {
      drawPdfCanvasCell(ctx, x, y, column.width, rowHeight, column.label, {
        align: 'center',
        fill: column.highlight ? highlightFill : headerFill,
        draw: column.highlight ? highlightBorder : gridColor,
        textColor: column.highlight ? highlightText : headerText,
        fontWeight: 'bold',
        fontSize: column.highlight ? 29 : 30,
        lineWidth: column.highlight ? mm(0.55) : mm(0.2),
        paddingX: 10,
        fontFamily: fontFamily
      });
      x += column.width;
    });

    y += rowHeight;
    bodyRows.forEach((row) => {
      x = marginX;
      columns.forEach((column) => {
        drawPdfCanvasCell(ctx, x, y, column.width, rowHeight, row[column.key], {
          align: column.bodyAlign,
          fill: column.highlight ? '#faf7ff' : '#ffffff',
          draw: column.highlight ? highlightBorder : gridColor,
          textColor: column.highlight ? highlightText : bodyText,
          fontWeight: column.highlight ? 'bold' : 'normal',
          fontSize: 30,
          lineWidth: column.highlight ? mm(0.45) : mm(0.2),
          fontFamily: fontFamily
        });
        x += column.width;
      });
      y += rowHeight;
    });

    y += mm(6);
    y += drawCanvasParagraph(ctx, 'Przelicznik praktyczny = wynik zaokrąglony do pełnych g/j. Przelicznik dokładny = wynik z dwoma miejscami po przecinku.', marginX, y, pageContentWidth, {
      fontSize: 25,
      color: '#434d4d',
      fontFamily: fontFamily
    });
    y += mm(1.2);
    drawCanvasParagraph(ctx, 'W raporcie uwzględniono wszystkie posiłki zapisane dla wybranego dnia. Kolumna praktyczna jest wyróżniona fioletową ramką.', marginX, y, pageContentWidth, {
      fontSize: 25,
      color: '#434d4d',
      fontFamily: fontFamily
    });

    return canvas;
  }

  function buildRatioPdfDocumentDefinition(entries, dateLabel, threshold, formatNumberFn, capitalizeFirstFn) {
    if (!Array.isArray(entries) || !entries.length) {
      return null;
    }

    const formatNumberSafe = typeof formatNumberFn === 'function' ? formatNumberFn : formatNumberLocal;
    const capitalizeFirstSafe = typeof capitalizeFirstFn === 'function' ? capitalizeFirstFn : capitalizeFirstLocal;
    const practicalColumnIndex = 6;
    const normalizedEntries = entries.map((entry) => deriveEntryMetrics(entry, threshold));
    const sensitivityInfo = getDaySensitivityInfo(normalizedEntries);
    const sensitivitySummary = buildSensitivitySummaryParts(sensitivityInfo, dateLabel, formatNumberSafe);

    function createPdfCell(text, options) {
      const opts = options || {};
      const cell = {
        text: sanitizePdfText(text),
        alignment: opts.alignment || 'left',
        margin: Array.isArray(opts.margin) ? opts.margin : [4, 4, 4, 4]
      };

      if (opts.bold) {
        cell.bold = true;
      }
      if (opts.fillColor) {
        cell.fillColor = opts.fillColor;
      }
      if (opts.color) {
        cell.color = opts.color;
      }
      if (Number.isFinite(opts.fontSize)) {
        cell.fontSize = opts.fontSize;
      }
      if (Number.isFinite(opts.colSpan) && opts.colSpan > 1) {
        cell.colSpan = opts.colSpan;
      }
      if (Array.isArray(opts.border)) {
        cell.border = opts.border;
      }
      if (Array.isArray(opts.borderColor)) {
        cell.borderColor = opts.borderColor;
      }
      if (typeof opts.rowRole === 'string' && opts.rowRole) {
        cell._rowRole = opts.rowRole;
      }

      return cell;
    }

    function getPdfRowRoleFromBody(tableBody, rowIndex) {
      if (!Array.isArray(tableBody) || rowIndex < 0 || rowIndex >= tableBody.length) {
        return '';
      }

      const row = tableBody[rowIndex];
      if (!Array.isArray(row)) {
        return '';
      }

      for (let index = 0; index < row.length; index += 1) {
        const cell = row[index];
        if (cell && typeof cell === 'object' && typeof cell._rowRole === 'string' && cell._rowRole) {
          return cell._rowRole;
        }
      }

      return '';
    }

    function getPdfRowRoleFromNode(node, rowIndex) {
      if (!node || !node.table || !Array.isArray(node.table.body)) {
        return '';
      }

      return getPdfRowRoleFromBody(node.table.body, rowIndex);
    }

    function createPdfSpanPlaceholder(rowRole) {
      return {
        text: '',
        border: [false, false, false, false],
        margin: [0, 0, 0, 0],
        _rowRole: rowRole || ''
      };
    }

    function createPdfSpacerRow(columnCount) {
      const totalColumns = Number.isFinite(columnCount) && columnCount > 0 ? columnCount : 1;
      const spacerRow = [
        createPdfCell('', {
          alignment: 'left',
          colSpan: totalColumns,
          border: [false, false, false, false],
          margin: [0, 0, 0, 0],
          fontSize: 1,
          rowRole: 'spacer'
        })
      ];

      for (let index = 1; index < totalColumns; index += 1) {
        spacerRow.push(createPdfSpanPlaceholder('spacer'));
      }

      return spacerRow;
    }

    const headerRow = [
      createPdfCell('Posiłek', { alignment: 'center', bold: true, fillColor: '#eef7f7', color: '#005f66', fontSize: 10.0, margin: [3, 5, 3, 5] }),
      createPdfCell('DDI [j.]', { alignment: 'center', bold: true, fillColor: '#eef7f7', color: '#005f66', fontSize: 10.0, margin: [3, 5, 3, 5] }),
      createPdfCell('Węglowodany [g]', { alignment: 'center', bold: true, fillColor: '#eef7f7', color: '#005f66', fontSize: 10.0, margin: [3, 5, 3, 5] }),
      createPdfCell('Insulina [j.]', { alignment: 'center', bold: true, fillColor: '#eef7f7', color: '#005f66', fontSize: 10.0, margin: [3, 5, 3, 5] }),
      createPdfCell('Glikemia przed [mg/dl]', { alignment: 'center', bold: true, fillColor: '#eef7f7', color: '#005f66', fontSize: 9.8, margin: [3, 5, 3, 5] }),
      createPdfCell('Glikemia po 2–3 h [mg/dl]', { alignment: 'center', bold: true, fillColor: '#eef7f7', color: '#005f66', fontSize: 9.8, margin: [3, 5, 3, 5] }),
      createPdfCell('Przelicznik praktyczny [g/j]', { alignment: 'center', bold: true, fillColor: '#f5f3ff', color: '#5b21b6', fontSize: 9.8, margin: [3, 5, 3, 5], borderColor: ['#7c3aed', '#7c3aed', '#7c3aed', '#becdcd'] }),
      createPdfCell('Przelicznik dokładny [g/j]', { alignment: 'center', bold: true, fillColor: '#eef7f7', color: '#005f66', fontSize: 9.8, margin: [3, 5, 3, 5] })
    ];

    const bodyRows = [];
    normalizedEntries.forEach((entry, entryIndex) => {
      const isLastEntry = entryIndex === normalizedEntries.length - 1;
      const balanceText = buildInsulinBalancePlainText(entry, formatNumberSafe);

      bodyRows.push([
        createPdfCell(capitalizeFirstSafe(entry.mealType), { alignment: 'left', rowRole: 'meal' }),
        createPdfCell(formatNumberSafe(entry.ddi, 1), { alignment: 'right' }),
        createPdfCell(formatNumberSafe(entry.carbs, 1), { alignment: 'right' }),
        createPdfCell(formatNumberSafe(entry.insulinDose, 1), { alignment: 'right' }),
        createPdfCell(formatNumberSafe(entry.glucoseBefore, 0), { alignment: 'right' }),
        createPdfCell(formatNumberSafe(entry.glucoseAfter, 0), { alignment: 'right' }),
        createPdfCell(formatNumberSafe(entry.ratioRounded, 0), { alignment: 'right', bold: true, fillColor: '#faf7ff', color: '#5b21b6', borderColor: ['#7c3aed', '#becdcd', '#7c3aed', '#becdcd'] }),
        createPdfCell(formatNumberSafe(entry.ratioExact, 2), { alignment: 'right' })
      ]);

      bodyRows.push([
        createPdfCell(`Ocena dawki: ${balanceText}`, {
          alignment: 'left',
          colSpan: 8,
          fillColor: '#faf7ff',
          color: '#3f3f46',
          fontSize: 9.6,
          margin: [6, 5, 6, 5],
          border: [true, true, true, isLastEntry],
          borderColor: ['#becdcd', '#becdcd', '#becdcd', isLastEntry ? '#becdcd' : '#d8c7ff'],
          rowRole: 'analysis'
        }),
        createPdfSpanPlaceholder('analysis'),
        createPdfSpanPlaceholder('analysis'),
        createPdfSpanPlaceholder('analysis'),
        createPdfSpanPlaceholder('analysis'),
        createPdfSpanPlaceholder('analysis'),
        createPdfSpanPlaceholder('analysis'),
        createPdfSpanPlaceholder('analysis')
      ]);

      if (!isLastEntry) {
        bodyRows.push(createPdfSpacerRow(8));
      }
    });

    const tableBody = [headerRow].concat(bodyRows);

    const content = [
      { text: 'Kalkulator przeliczników doposiłkowych', style: 'pdfTitle' },
      { text: `Obliczenia dla dnia: ${dateLabel}`, style: 'pdfMeta', margin: [0, 4, 0, 0] },
      { text: `Liczysz z wczoraj, stosujesz dziś. Próg stabilnej różnicy glikemii: ±${threshold} mg/dl.`, style: 'pdfMeta', margin: [0, 2, 0, 10] }
    ];

    if (sensitivitySummary) {
      content.push({ text: sensitivitySummary.mainText, style: 'pdfSensitivity', margin: [0, 0, 0, 0], alignment: 'center' });
      if (sensitivitySummary.noteText) {
        content.push({ text: sensitivitySummary.noteText, style: 'pdfSensitivityNote', margin: [0, 2, 0, 10], alignment: 'center' });
      } else {
        content.push({ text: '', margin: [0, 0, 0, 6] });
      }
    }

    content.push({
      table: {
        headerRows: 1,
        widths: [96, 54, 77, 68, 108, 116, 136, 102],
        body: tableBody,
        heights: function (rowIndex) {
          return getPdfRowRoleFromBody(tableBody, rowIndex) === 'spacer' ? 12 : undefined;
        }
      },
      layout: {
        hLineWidth: function (index, node) {
          const previousRowRole = getPdfRowRoleFromNode(node, index - 1);
          const nextRowRole = getPdfRowRoleFromNode(node, index);

          if (previousRowRole === 'spacer' || nextRowRole === 'spacer') {
            return 0;
          }

          return 0.5;
        },
        vLineWidth: function (index) {
          return index === practicalColumnIndex || index === practicalColumnIndex + 1 ? 0.8 : 0.5;
        },
        hLineColor: function () { return '#becdcd'; },
        vLineColor: function (index) {
          return index === practicalColumnIndex || index === practicalColumnIndex + 1 ? '#7c3aed' : '#becdcd';
        },
        paddingLeft: function () { return 0; },
        paddingRight: function () { return 0; },
        paddingTop: function () { return 0; },
        paddingBottom: function () { return 0; }
      }
    });

    content.push(
      { text: 'Przelicznik praktyczny = wynik zaokrąglony do pełnych g/j. Przelicznik dokładny = wynik z dwoma miejscami po przecinku.', style: 'pdfNote', margin: [0, 10, 0, 0] },
      { text: 'Pod każdym posiłkiem podano ocenę, czy dawka insuliny była dobrze dobrana, czy zabrakło insuliny, czy część dawki była nadmiarowa / stanowiła korektę.', style: 'pdfNote', margin: [0, 2, 0, 0] },
      { text: 'W raporcie uwzględniono wszystkie posiłki zapisane dla wybranego dnia. Kolumna praktyczna jest wyróżniona fioletowym tłem i obramowaniem.', style: 'pdfNote', margin: [0, 2, 0, 0] }
    );

    return {
      compress: true,
      pageSize: 'A4',
      pageOrientation: 'landscape',
      pageMargins: [26, 24, 26, 24],
      info: {
        title: sanitizePdfText(`Przeliczniki doposiłkowe — obliczenia dla dnia: ${dateLabel}`),
        subject: sanitizePdfText('Kalkulator przelicznika doposiłkowego'),
        author: 'wagaiwzrost.pl'
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10.5,
        color: '#212b36'
      },
      content: content,
      styles: {
        pdfTitle: {
          fontSize: 20,
          bold: true,
          color: '#172222'
        },
        pdfMeta: {
          fontSize: 12,
          color: '#212b36'
        },
        pdfSensitivity: {
          fontSize: 11.8,
          bold: true,
          color: '#5b21b6'
        },
        pdfSensitivityNote: {
          fontSize: 11.8,
          color: '#6d28d9'
        },
        pdfNote: {
          fontSize: 10.2,
          color: '#434d4d'
        }
      }
    };
  }

  function openPrintFallback(entries, dateLabel, formatNumber, capitalizeFirst, threshold) {
    const normalizedEntries = entries.map((entry) => deriveEntryMetrics(entry, threshold));
    const sensitivityInfo = getDaySensitivityInfo(normalizedEntries);
    const sensitivitySummary = buildSensitivitySummaryParts(sensitivityInfo, dateLabel, formatNumber);

    const rowsHtml = normalizedEntries.map((entry, entryIndex) => {
      const balance = getInsulinBalanceInfo(entry, formatNumber);
      const isLastEntry = entryIndex === normalizedEntries.length - 1;
      const mainRowClass = entryIndex > 0 ? 'main-row main-row--after-gap' : 'main-row';
      const detailRowClass = isLastEntry ? 'detail-row' : 'detail-row detail-row--spaced';
      const spacerRowHtml = isLastEntry ? '' : `
      <tr class="spacer-row" aria-hidden="true">
        <td colspan="8"></td>
      </tr>`;

      return `
      <tr class="${mainRowClass}">
        <th scope="row">${escapeHtml(capitalizeFirst(entry.mealType))}</th>
        <td class="num">${escapeHtml(formatNumber(entry.ddi, 1))}</td>
        <td class="num">${escapeHtml(formatNumber(entry.carbs, 1))}</td>
        <td class="num">${escapeHtml(formatNumber(entry.insulinDose, 1))}</td>
        <td class="num">${escapeHtml(formatNumber(entry.glucoseBefore, 0))}</td>
        <td class="num">${escapeHtml(formatNumber(entry.glucoseAfter, 0))}</td>
        <td class="num practical"><strong>${escapeHtml(formatNumber(entry.ratioRounded, 0))}</strong></td>
        <td class="num">${escapeHtml(formatNumber(entry.ratioExact, 2))}</td>
      </tr>
      <tr class="${detailRowClass}">
        <td colspan="8">
          <span class="chip chip--${escapeHtml(balance.chipModifier)}">${escapeHtml(balance.chipLabel)}</span>
          <span class="balance-main">${escapeHtml(balance.mainText)}</span>
          ${balance.subText ? `<span class="balance-sub">${escapeHtml(balance.subText)}</span>` : ''}
        </td>
      </tr>${spacerRowHtml}
    `;
    }).join('');

    const sensitivityHtml = sensitivitySummary ? `
  <div class="sensitivity">
    <strong>${escapeHtml(sensitivitySummary.mainText)}</strong>
    ${sensitivitySummary.noteText ? `<span>${escapeHtml(sensitivitySummary.noteText)}</span>` : ''}
  </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>Przeliczniki doposiłkowe — obliczenia dla dnia: ${escapeHtml(dateLabel)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; margin: 0; color: #222; }
  h1 { margin: 0 0 6mm; font-size: 22.5pt; }
  p { margin: 0 0 3mm; font-size: 11.9pt; line-height: 1.45; }
  .sensitivity {
    margin: 0 0 4mm;
    padding: 3.2mm 3.5mm;
    border: 1px solid rgba(124,58,237,0.28);
    border-radius: 4mm;
    background: rgba(124,58,237,0.08);
    color: #5b21b6;
    font-size: 11.6pt;
    line-height: 1.5;
    text-align: center;
  }
  .sensitivity strong { display: block; color: #5b21b6; }
  .sensitivity span { display: block; margin-top: 1.2mm; color: #6d28d9; font-size: 11.6pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 5mm; table-layout: fixed; }
  th, td { border: 1px solid #b8c7c7; padding: 3mm 2.4mm; font-size: 10.9pt; vertical-align: top; }
  thead th { background: #eef7f7; color: #005f66; text-align: center; }
  td, th { text-align: left; }
  td.num { text-align: right; white-space: nowrap; }
  tr.main-row > th, tr.main-row > td { border-bottom: none; }
  tr.main-row--after-gap > th, tr.main-row--after-gap > td { border-top: none; }
  tr.detail-row td {
    background: #faf7ff;
    font-size: 10.5pt;
    color: #3f3f46;
  }
  tr.detail-row--spaced td { border-bottom: none; }
  tr.spacer-row td {
    border: none;
    padding: 0;
    height: 4.2mm;
    background: transparent;
    font-size: 0;
    line-height: 0;
  }
  thead th.practical, td.practical {
    background: #f5f3ff;
    border-left: 2px solid #7c3aed;
    border-right: 2px solid #7c3aed;
  }
  thead th.practical {
    color: #5b21b6;
    border-top: 2px solid #7c3aed;
  }
  td.practical strong { color: #5b21b6; }
  .chip {
    display: inline-block;
    padding: 1mm 2mm;
    border-radius: 999px;
    font-size: 9.8pt;
    font-weight: 700;
    margin-right: 2.2mm;
    vertical-align: middle;
  }
  .chip--stable { background: rgba(0,131,141,0.12); color: #005f66; border: 1px solid rgba(0,131,141,0.18); }
  .chip--warn { background: rgba(178,107,0,0.12); color: #8b5300; border: 1px solid rgba(178,107,0,0.18); }
  .chip--danger { background: rgba(198,40,40,0.10); color: #c62828; border: 1px solid rgba(198,40,40,0.16); }
  .balance-main { font-weight: 600; color: #212b36; }
  .balance-sub { display: block; margin-top: 1.5mm; font-size: 10pt; color: #566565; }
  .note { margin-top: 4mm; font-size: 10.6pt; color: #444; }
</style>
</head>
<body>
  <h1>Przeliczniki doposiłkowe</h1>
  <p><strong>Obliczenia dla dnia:</strong> ${escapeHtml(dateLabel)}</p>
  <p><strong>Założenie kalkulatora:</strong> próg stabilnej różnicy glikemii = ±${escapeHtml(String(threshold))} mg/dl.</p>
  <p><strong>Zasada:</strong> liczysz z wczoraj, stosujesz dziś.</p>${sensitivityHtml}
  <table>
    <thead>
      <tr>
        <th scope="col">Posiłek</th>
        <th scope="col">DDI [j.]</th>
        <th scope="col">Węglowodany [g]</th>
        <th scope="col">Insulina [j.]</th>
        <th scope="col">Glikemia przed [mg/dl]</th>
        <th scope="col">Glikemia po 2–3 h [mg/dl]</th>
        <th scope="col" class="practical">Przelicznik praktyczny [g/j]</th>
        <th scope="col">Przelicznik dokładny [g/j]</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p class="note">Przelicznik praktyczny = wynik zaokrąglony do pełnych g/j. Przelicznik dokładny = wynik z dwoma miejscami po przecinku.</p>
  <p class="note">Pod każdym posiłkiem podano ocenę, czy dawka insuliny była dobrze dobrana, czy zabrakło insuliny, czy część dawki była nadmiarowa / stanowiła korektę.</p>
</body>
</html>`;

    try {
      const existingFrame = qs('ratioPdfPrintFrame');
      if (existingFrame && existingFrame.parentNode) {
        existingFrame.parentNode.removeChild(existingFrame);
      }

      const printFrame = document.createElement('iframe');
      printFrame.id = 'ratioPdfPrintFrame';
      printFrame.setAttribute('aria-hidden', 'true');
      printFrame.tabIndex = -1;
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.opacity = '0';
      printFrame.style.pointerEvents = 'none';
      printFrame.style.border = '0';
      document.body.appendChild(printFrame);

      const frameWindow = printFrame.contentWindow;
      const frameDocument = frameWindow ? frameWindow.document : null;
      if (!frameWindow || !frameDocument) {
        throw new Error('Brak dostępu do dokumentu wydruku.');
      }

      frameDocument.open();
      frameDocument.write(html);
      frameDocument.close();

      const cleanup = function () {
        window.setTimeout(function () {
          if (printFrame.parentNode) {
            printFrame.parentNode.removeChild(printFrame);
          }
        }, 1000);
      };

      const triggerPrint = function () {
        try {
          frameWindow.focus();
        } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('cukrzyca.js', error, { line: 4141 });
    }
  }
        window.setTimeout(function () {
          frameWindow.print();
          cleanup();
        }, 250);
      };

      if (frameDocument.readyState === 'complete') {
        triggerPrint();
      } else {
        printFrame.onload = triggerPrint;
      }

      return true;
    } catch (error) {
      return false;
    }
  }


  function initMealRatioCalculatorModule() {
    const toolkit = window.diabMealRatioToolkit || {};
    const computeScenario = typeof toolkit.computeScenario === 'function' ? toolkit.computeScenario : null;
    const parseLocaleNumber = typeof toolkit.parseLocaleNumber === 'function' ? toolkit.parseLocaleNumber : parseLocaleNumberLocal;
    const formatNumber = typeof toolkit.formatNumber === 'function' ? toolkit.formatNumber : formatNumberLocal;
    const capitalizeFirst = typeof toolkit.capitalizeFirst === 'function' ? toolkit.capitalizeFirst : capitalizeFirstLocal;
    const stableThresholdDefault = Number.isFinite(toolkit.stableThresholdDefault) ? toolkit.stableThresholdDefault : 30;
    const MACRO_TRANSFER_TO_CALCULATOR_EVENT = 'cukrzyca:macro-transfer-to-calculator';
    const MACRO_CLEARED_EVENT = 'cukrzyca:macro-cleared';
    const RATIO_DAY_CLEARED_EVENT = 'cukrzyca:ratio-day-cleared';
    const CLEAR_ALL_EVENT = 'cukrzyca:clear-all-modules';

    const launcher = qs('moduleLauncher');
    const macroContent = qs('macroContent');
    const macroLauncherBtn = qs('macroLauncherBtn');
    const learningContent = qs('moduleContent');
    const moduleLauncherBtn = qs('moduleLauncherBtn');
    const calculatorLauncherBtn = qs('calculatorLauncherBtn');
    const calculatorContent = qs('calculatorContent');
    const calculatorBackBtn = qs('calculatorBackBtn');
    const calculatorMainHeading = qs('calculatorMainHeading');
    const calcForm = qs('ratioCalculatorForm');
    const calcDate = qs('calcDate');
    const calcMealType = qs('calcMealType');
    const calcDdi = qs('calcDdi');
    const calcCarbs = qs('calcCarbs');
    const calcInsulinDose = qs('calcInsulinDose');
    const calcGlucoseBefore = qs('calcGlucoseBefore');
    const calcGlucoseAfter = qs('calcGlucoseAfter');
    const calcClearDayBtn = qs('calcClearDayBtn');
    const calcExportPdfBtn = qs('calcExportPdfBtn');
    const calcMacroTransferStatus = qs('calcMacroTransferStatus');
    const calcStatus = qs('calcStatus');
    const calcTableMeta = qs('calcTableMeta');
    const calcDayBadge = qs('calcDayBadge');
    const calcResultsCaption = qs('calcResultsCaption');
    const calcSensitivitySummary = qs('calcSensitivitySummary');
    const calcEmptyState = qs('calcEmptyState');
    const calcTableWrap = qs('calcTableWrap');
    const calcResultsBody = qs('calcResultsBody');
    const calcResultsCard = qs('calcResultsCard');

    if (!computeScenario || !calculatorLauncherBtn || !calculatorContent || !calculatorBackBtn || !calcForm || !calcDate || !calcMealType || !calcResultsBody) {
      return;
    }

    const mealOrder = Array.from(calcMealType.options || []).map((option) => option.value).filter(Boolean);
    const state = {
      store: loadStore(),
      macroTransfer: null
    };

    function getMealOrderIndex(mealType) {
      const index = mealOrder.indexOf(mealType);
      return index === -1 ? mealOrder.length + 1 : index;
    }

    function ensureDateValue() {
      const normalized = normalizeDateValue(calcDate.value);
      if (calcDate.value !== normalized) {
        calcDate.value = normalized;
      }
      return normalized;
    }

    function getDayRecord(dateValue, create) {
      const normalizedDate = normalizeDateValue(dateValue);
      if (!state.store.days[normalizedDate] && create) {
        state.store.days[normalizedDate] = {
          date: normalizedDate,
          updatedAt: '',
          meals: {}
        };
      }
      return state.store.days[normalizedDate] || null;
    }

    function getDayEntries(dateValue) {
      const day = getDayRecord(dateValue, false);
      if (!day || !isPlainObject(day.meals)) {
        return [];
      }

      return Object.keys(day.meals)
        .map((mealType) => day.meals[mealType])
        .filter((entry) => isPlainObject(entry))
        .sort((a, b) => getMealOrderIndex(a.mealType) - getMealOrderIndex(b.mealType));
    }

    function updateDateLabels(dateValue) {
      const label = formatDateLabel(dateValue);
      if (calcTableMeta) {
        calcTableMeta.textContent = `Obliczenia dla dnia: ${label}`;
      }
      if (calcDayBadge) {
        calcDayBadge.textContent = label;
      }
      if (calcResultsCaption) {
        calcResultsCaption.textContent = `Przeliczniki doposiłkowe — obliczenia dla dnia: ${label}`;
      }
    }

    function renderSensitivitySummary(entries, dateValue) {
      if (!calcSensitivitySummary) return;
      if (!entries.length) {
        calcSensitivitySummary.hidden = true;
        diabClearHtml(calcSensitivitySummary);
        return;
      }

      const summary = buildSensitivitySummaryParts(getDaySensitivityInfo(entries), formatDateLabel(dateValue), formatNumber);
      if (!summary) {
        calcSensitivitySummary.hidden = true;
        diabClearHtml(calcSensitivitySummary);
        return;
      }

      calcSensitivitySummary.hidden = false;
      diabSetTrustedHtml(calcSensitivitySummary, `<strong>${escapeHtml(summary.mainText)}</strong>${summary.noteText ? `<small>${escapeHtml(summary.noteText)}</small>` : ''}`, 'cukrzyca:sensitivity-summary');
    }

    function renderTable() {
      const dateValue = ensureDateValue();
      const entries = getDayEntries(dateValue).map((entry) => deriveEntryMetrics(entry, stableThresholdDefault));
      updateDateLabels(dateValue);
      renderSensitivitySummary(entries, dateValue);

      if (calcResultsBody) {
        diabSetTrustedHtml(calcResultsBody, entries.map((entry) => {
          const balance = getInsulinBalanceInfo(entry, formatNumber);
          return `
          <tr class="diab-calc-table__main-row">
            <th scope="row">${escapeHtml(capitalizeFirst(entry.mealType))}</th>
            <td data-role="number" data-label="DDI [j.]">${escapeHtml(formatNumber(entry.ddi, 1))}</td>
            <td data-role="number" data-label="Węglowodany [g]">${escapeHtml(formatNumber(entry.carbs, 1))}</td>
            <td data-role="number" data-label="Insulina [j.]">${escapeHtml(formatNumber(entry.insulinDose, 1))}</td>
            <td data-role="number" data-label="Glikemia przed [mg/dl]">${escapeHtml(formatNumber(entry.glucoseBefore, 0))}</td>
            <td data-role="number" data-label="Glikemia po 2–3 h [mg/dl]">${escapeHtml(formatNumber(entry.glucoseAfter, 0))}</td>
            <td data-role="number" data-label="Przelicznik praktyczny [g/j]" class="diab-calc-table__highlight"><strong>${escapeHtml(formatNumber(entry.ratioRounded, 0))}</strong></td>
            <td data-role="number" data-label="Przelicznik dokładny [g/j]">${escapeHtml(formatNumber(entry.ratioExact, 2))}</td>
          </tr>
          <tr class="diab-calc-table__detail-row">
            <td colspan="8">
              <span class="diab-calc-balance-chip diab-calc-balance-chip--${escapeHtml(balance.chipModifier)}">${escapeHtml(balance.chipLabel)}</span>
              <span class="diab-calc-balance-main">${escapeHtml(balance.mainText)}</span>
              ${balance.subText ? `<span class="diab-calc-balance-sub">${escapeHtml(balance.subText)}</span>` : ''}
            </td>
          </tr>
        `;
        }).join(''), 'meal ratio table body');
      }

      if (calcEmptyState) {
        calcEmptyState.hidden = entries.length > 0;
        if (!entries.length) {
          calcEmptyState.textContent = `Brak zapisanych obliczeń dla dnia ${formatDateLabel(dateValue)}.`;
        }
      }

      if (calcTableWrap) {
        calcTableWrap.hidden = entries.length === 0;
      }

      if (calcExportPdfBtn) {
        calcExportPdfBtn.disabled = entries.length === 0;
      }
    }

    function showStatus(message, kind) {
      if (!calcStatus) return;
      calcStatus.hidden = !message;
      diabSetTrustedHtml(calcStatus, message || '', 'cukrzyca:calc-status');
      calcStatus.className = 'diab-status';
      if (kind === 'success') {
        calcStatus.classList.add('diab-status--success');
      } else if (kind === 'info') {
        calcStatus.classList.add('diab-status--info');
      }
    }

    function clearStatus() {
      if (!calcStatus) return;
      calcStatus.hidden = true;
      diabClearHtml(calcStatus);
      calcStatus.className = 'diab-status';
    }

    function hideMacroTransferStatus() {
      if (!calcMacroTransferStatus) return;
      calcMacroTransferStatus.hidden = true;
      diabClearHtml(calcMacroTransferStatus);
      calcMacroTransferStatus.className = 'diab-status';
    }

    function rememberMacroTransferLink() {
      if (!calcCarbs) {
        state.macroTransfer = null;
        return;
      }
      const currentValue = String(calcCarbs.value || '').trim();
      state.macroTransfer = currentValue ? { carbsValue: currentValue } : null;
    }

    function releaseMacroTransferLink() {
      state.macroTransfer = null;
      hideMacroTransferStatus();
    }

    function clearLinkedMacroTransferIfNeeded() {
      let changed = false;
      if (state.macroTransfer && calcCarbs) {
        const currentValue = String(calcCarbs.value || '').trim();
        if (!currentValue || currentValue === state.macroTransfer.carbsValue) {
          if (currentValue) {
            changed = true;
          }
          calcCarbs.value = '';
        }
      }
      releaseMacroTransferLink();
      return changed;
    }

    function clearFields() {
      releaseMacroTransferLink();
      if (calcMealType) calcMealType.value = '';
      [calcDdi, calcCarbs, calcInsulinDose, calcGlucoseBefore, calcGlucoseAfter].forEach((field) => {
        if (field) {
          field.value = '';
        }
      });
    }

    function resetCalculatorModuleForNewPatient() {
      state.store = createEmptyStore();
      let persisted = true;
      try {
        const ok = window.vildaDiabetesPersistence
          ? window.vildaDiabetesPersistence.removeKey('DIABETES_MEAL_RATIOS')
          : false;
        if (!ok) persisted = saveStore(state.store);
      } catch (error) {
        persisted = saveStore(state.store);
      }
      calcDate.value = getYesterdayDateValue();
      clearFields();
      clearStatus();
      renderTable();
      return persisted;
    }

    function focusHeading() {
      if (!calculatorMainHeading || typeof calculatorMainHeading.focus !== 'function') return;
      calculatorMainHeading.setAttribute('tabindex', '-1');
      requestAnimationFrame(function () {
        calculatorMainHeading.focus({ preventScroll: true });
      });
    }

    function openCalculatorModule() {
      if (launcher) {
        launcher.hidden = true;
      }
      if (macroContent) {
        macroContent.hidden = true;
      }
      if (learningContent) {
        learningContent.hidden = true;
      }
      if (moduleLauncherBtn) {
        moduleLauncherBtn.setAttribute('aria-expanded', 'false');
      }
      if (macroLauncherBtn) {
        macroLauncherBtn.setAttribute('aria-expanded', 'false');
      }
      calculatorContent.hidden = false;
      calculatorLauncherBtn.setAttribute('aria-expanded', 'true');
      renderTable();
      focusHeading();
    }

    function closeCalculatorModule() {
      calculatorContent.hidden = true;
      calculatorLauncherBtn.setAttribute('aria-expanded', 'false');
      if (launcher) {
        launcher.hidden = false;
      }
      requestAnimationFrame(function () {
        calculatorLauncherBtn.focus({ preventScroll: true });
        if (launcher && typeof launcher.scrollIntoView === 'function') {
          launcher.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    function collectFormData() {
      return {
        date: ensureDateValue(),
        mealType: calcMealType ? calcMealType.value : '',
        ddi: parseLocaleNumber(calcDdi ? calcDdi.value : ''),
        carbs: parseLocaleNumber(calcCarbs ? calcCarbs.value : ''),
        insulinDose: parseLocaleNumber(calcInsulinDose ? calcInsulinDose.value : ''),
        glucoseBefore: parseLocaleNumber(calcGlucoseBefore ? calcGlucoseBefore.value : ''),
        glucoseAfter: parseLocaleNumber(calcGlucoseAfter ? calcGlucoseAfter.value : '')
      };
    }

    function validateFormData(data) {
      if (!data.mealType) {
        return 'Wybierz rodzaj posiłku.';
      }

      if ([data.ddi, data.carbs, data.insulinDose, data.glucoseBefore, data.glucoseAfter].some((value) => !Number.isFinite(value))) {
        return 'Uzupełnij wszystkie pola liczbowe.';
      }

      if (data.ddi <= 0 || data.carbs <= 0 || data.insulinDose <= 0) {
        return 'DDI, węglowodany i dawka insuliny muszą być większe od zera.';
      }

      if (data.glucoseBefore < 20 || data.glucoseAfter < 20) {
        return 'Podane glikemie są zbyt niskie, żeby obliczyć wiarygodny przelicznik.';
      }

      if (data.glucoseBefore < 70) {
        return 'Jeśli glikemia przed posiłkiem jest poniżej 70 mg/dl, najpierw trzeba leczyć hipoglikemię. Do tego kalkulatora ustaw glikemię przed posiłkiem co najmniej 70 mg/dl.';
      }

      return '';
    }

    function buildScenarioInput(data) {
      return {
        mealType: data.mealType,
        ddi: data.ddi,
        carbs: data.carbs,
        insulinDose: data.insulinDose,
        glucoseBefore: data.glucoseBefore,
        glucoseAfter: data.glucoseAfter,
        threshold: stableThresholdDefault,
        proMode: false,
        exerciseMode: 'none',
        infectionMode: 'none',
        stressMode: 'none',
        fatProteinMode: 'none'
      };
    }

    function buildEntry(result, dateValue) {
      return {
        date: normalizeDateValue(dateValue),
        mealType: result.mealType,
        ddi: result.ddi,
        carbs: result.carbs,
        insulinDose: result.bolusDose,
        glucoseBefore: result.glucoseBefore,
        glucoseAfter: result.glucoseAfter,
        ratioRounded: result.ratioRounded,
        ratioExact: result.ratioExact,
        threshold: result.threshold,
        mealInsulin: result.mealInsulin,
        scenarioType: result.scenarioType,
        sensitivityExact: result.sensitivityExact,
        sensitivityPractical: result.sensitivityPractical,
        adjustmentRounded: result.adjustmentRounded,
        delta: result.delta,
        savedAt: new Date().toISOString()
      };
    }

    function exportPdf() {
      const dateValue = ensureDateValue();
      const dateLabel = formatDateLabel(dateValue);
      const entries = getDayEntries(dateValue).map((entry) => deriveEntryMetrics(entry, stableThresholdDefault));

      if (!entries.length) {
        showStatus('Brak danych do eksportu PDF dla wybranego dnia.', 'info');
        return;
      }

      if (window.pdfMake && typeof window.pdfMake.createPdf === 'function') {
        try {
          const definition = buildRatioPdfDocumentDefinition(entries, dateLabel, stableThresholdDefault, formatNumber, capitalizeFirst);

          if (!definition) {
            throw new Error('Nie udało się przygotować dokumentu PDF.');
          }

          window.pdfMake.createPdf(definition).download(`przeliczniki_doposilkowe_${dateValue}.pdf`);
          showStatus(`Wyeksportowano PDF dla dnia <strong>${escapeHtml(dateLabel)}</strong>.`, 'success');
          return;
        } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('cukrzyca.js', error, { line: 4554 });
    }
  }
      }

      const opened = openPrintFallback(entries, dateLabel, formatNumber, capitalizeFirst, stableThresholdDefault);
      if (opened) {
        showStatus('Otwarto widok wydruku. Wybierz „Zapisz jako PDF”, aby pobrać tekstowy PDF z zachowaniem jakości.', 'info');
      } else {
        showStatus('Nie udało się uruchomić eksportu PDF ani widoku wydruku.', 'info');
      }
    }


    calculatorLauncherBtn.addEventListener('click', function (event) {
      event.preventDefault();
      openCalculatorModule();
    });

    calculatorBackBtn.addEventListener('click', function (event) {
      event.preventDefault();
      closeCalculatorModule();
    });

    calcForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const data = collectFormData();
      const validationMessage = validateFormData(data);
      if (validationMessage) {
        showStatus(validationMessage, 'error');
        return;
      }

      const result = computeScenario(buildScenarioInput(data));
      if (!result || !result.ok) {
        showStatus(result && result.message ? result.message : 'Nie udało się obliczyć przelicznika.', 'error');
        return;
      }

      const day = getDayRecord(data.date, true);
      const existed = Boolean(day && day.meals && day.meals[data.mealType]);
      if (!day || !isPlainObject(day.meals)) {
        showStatus('Nie udało się przygotować zapisu dla wybranego dnia.', 'error');
        return;
      }

      day.meals[data.mealType] = buildEntry(result, data.date);
      day.updatedAt = new Date().toISOString();
      const persisted = saveStore(state.store);
      renderTable();

      const mealLabel = capitalizeFirst(data.mealType);
      const baseMessage = `${existed ? 'Zaktualizowano' : 'Zapisano'} <strong>${escapeHtml(mealLabel)}</strong> dla dnia <strong>${escapeHtml(formatDateLabel(data.date))}</strong>. Przelicznik praktyczny: <strong>${escapeHtml(formatNumber(result.ratioRounded, 0))} g/j</strong>. Przelicznik dokładny: <strong>${escapeHtml(formatNumber(result.ratioExact, 2))} g/j</strong>. Tego przelicznika użyj w kroku 4 do <strong>tego samego rodzaju dzisiejszego posiłku</strong> — dzisiejsze węglowodany wpisz osobno.`;
      if (persisted) {
        showStatus(baseMessage, 'success');
      } else {
        showStatus(`${baseMessage} Nie udało się jednak zapisać danych w pamięci przeglądarki — wynik pozostanie widoczny tylko do odświeżenia strony.`, 'error');
      }

      if (calcResultsCard && typeof calcResultsCard.scrollIntoView === 'function') {
        calcResultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    if (calcDate) {
      calcDate.addEventListener('change', function () {
        ensureDateValue();
        renderTable();
        clearStatus();
      });
    }

    if (calcCarbs) {
      ['input', 'change'].forEach(function (eventName) {
        calcCarbs.addEventListener(eventName, function () {
          if (state.macroTransfer) {
            releaseMacroTransferLink();
          }
        });
      });
    }

    window.addEventListener(MACRO_TRANSFER_TO_CALCULATOR_EVENT, function () {
      rememberMacroTransferLink();
    });

    window.addEventListener(MACRO_CLEARED_EVENT, function () {
      clearLinkedMacroTransferIfNeeded();
    });

    if (calcClearDayBtn) {
      calcClearDayBtn.addEventListener('click', function (event) {
        event.preventDefault();
        const dateValue = ensureDateValue();
        const dateLabel = formatDateLabel(dateValue);
        const entries = getDayEntries(dateValue);
        const hasEntries = entries.length > 0;
        const promptText = hasEntries
          ? `Czy na pewno chcesz usunąć wszystkie zapisane obliczenia z dnia ${dateLabel}?`
          : `Czy chcesz wyczyścić pola kalkulatora dla dnia ${dateLabel}?`;

        if (!window.confirm(promptText)) {
          return;
        }

        delete state.store.days[dateValue];
        const persisted = saveStore(state.store);
        clearFields();
        renderTable();
        if (hasEntries) {
          window.dispatchEvent(new CustomEvent(RATIO_DAY_CLEARED_EVENT, {
            detail: {
              dateValue: dateValue,
              hadEntries: true
            }
          }));
        }

        const messageBase = hasEntries
          ? `Wyczyszczono zapisane obliczenia dla dnia <strong>${escapeHtml(dateLabel)}</strong>.`
          : `Wyczyszczono pola kalkulatora dla dnia <strong>${escapeHtml(dateLabel)}</strong>.`;
        const message = persisted
          ? messageBase
          : `${messageBase} Zmiana nie została jednak zapisana w pamięci przeglądarki i może zniknąć po odświeżeniu strony.`;
        showStatus(message, persisted ? 'success' : 'error');
      });
    }

    if (calcExportPdfBtn) {
      calcExportPdfBtn.addEventListener('click', function (event) {
        event.preventDefault();
        exportPdf();
      });
    }

    window.addEventListener(CLEAR_ALL_EVENT, function (event) {
      const persisted = resetCalculatorModuleForNewPatient();
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : null;
      if (detail && persisted === false) {
        detail.storageOk = false;
      }
    });

    calcDate.value = getYesterdayDateValue();
    renderTable();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMealRatioCalculatorModule);
  } else {
    initMealRatioCalculatorModule();
  }
})();



(function () {
  'use strict';

  const STORAGE_KEY = 'wagaiwzrost_cukrzyca_macro_bt_draft_v1';
  const DEFAULT_EXAMPLE_KEY = 'mealMix';
  const EXAMPLES = {
    mealMix: [
      { name: 'Chleb pszenny (2 kromki)', mass: '70', carbs100: '41', protein100: '13', fat100: '3.4' },
      { name: 'Duże jabłko', mass: '150', carbs100: '13.8', protein100: '0.26', fat100: '0.17' },
      { name: 'Twarożek wiejski', mass: '180', carbs100: '3.4', protein100: '11', fat100: '4.3' }
    ],
    breadEggs: [
      { name: 'Chleb pszenny (2 kromki)', mass: '70', carbs100: '41', protein100: '13', fat100: '3.4' },
      { name: 'Jajka gotowane (3 szt.)', mass: '140', carbs100: '0.6', protein100: '12.5', fat100: '9.7' }
    ]
  };

  function qs(id) {
    return document.getElementById(id);
  }

  function parseLocaleNumber(value) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const normalized = String(value).trim().replace(/\s+/g, '').replace(',', '.');
    return normalized === '' ? NaN : Number(normalized);
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits
    }).format(value);
  }

  function toInputValue(value, digits) {
    if (!Number.isFinite(value)) return '';
    const rounded = Number(value.toFixed(Math.max(0, digits || 0)));
    return String(rounded).replace(',', '.');
  }

  function cloneExampleRows(key) {
    const rows = EXAMPLES[key] || EXAMPLES[DEFAULT_EXAMPLE_KEY] || [];
    return rows.map(function (row) {
      return Object.assign({}, row);
    });
  }

  function createEmptyRow() {
    return {
      name: '',
      mass: '',
      carbs100: '',
      protein100: '',
      fat100: ''
    };
  }

  function isRowDataEmpty(rowData) {
    if (!rowData || typeof rowData !== 'object') return true;
    return ['name', 'mass', 'carbs100', 'protein100', 'fat100'].every(function (key) {
      return String(rowData[key] == null ? '' : rowData[key]).trim() === '';
    });
  }

  function sanitizeRowData(rowData) {
    const source = rowData && typeof rowData === 'object' ? rowData : {};
    return {
      name: String(source.name || '').slice(0, 120),
      mass: String(source.mass || '').slice(0, 24),
      carbs100: String(source.carbs100 || '').slice(0, 24),
      protein100: String(source.protein100 || '').slice(0, 24),
      fat100: String(source.fat100 || '').slice(0, 24)
    };
  }

  function loadDraftRows() {
    try {
      const parsed = window.vildaDiabetesPersistence
        ? window.vildaDiabetesPersistence.readJSON('DIABETES_MACRO_BT_DRAFT', null)
        : null;
      if (!parsed || !Array.isArray(parsed.rows)) return [createEmptyRow()];
      const rows = parsed.rows
        .slice(0, 20)
        .map(sanitizeRowData);
      return rows.length ? rows : [createEmptyRow()];
    } catch (error) {
      return [createEmptyRow()];
    }
  }

  function saveDraftRows(rows) {
    try {
      if (window.vildaDiabetesPersistence) {
        return window.vildaDiabetesPersistence.writeJSON('DIABETES_MACRO_BT_DRAFT', { rows: rows.map(sanitizeRowData) });
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  function initMacroModule() {
    const MACRO_TRANSFER_TO_CALCULATOR_EVENT = 'cukrzyca:macro-transfer-to-calculator';
    const MACRO_CLEARED_EVENT = 'cukrzyca:macro-cleared';
    const CLEAR_ALL_EVENT = 'cukrzyca:clear-all-modules';

    const launcher = qs('moduleLauncher');
    const macroLauncherBtn = qs('macroLauncherBtn');
    const moduleLauncherBtn = qs('moduleLauncherBtn');
    const calculatorLauncherBtn = qs('calculatorLauncherBtn');
    const macroContent = qs('macroContent');
    const macroBackBtn = qs('macroBackBtn');
    const macroMainHeading = qs('macroMainHeading');
    const learningContent = qs('moduleContent');
    const calculatorContent = qs('calculatorContent');
    const macroHowToToggleBtn = qs('macroHowToToggleBtn');
    const macroHowToContent = qs('macroHowToContent');
    const macroIngredientList = qs('macroIngredientList');
    const addMacroIngredientBtn = qs('addMacroIngredientBtn');
    const insertMacroExampleBtn = qs('insertMacroExampleBtn');
    const clearMacroFormBtn = qs('clearMacroFormBtn');
    const macroExampleBtns = Array.from(document.querySelectorAll('[data-macro-example]'));
    const macroEmptyState = qs('macroEmptyState');
    const macroSummaryWrap = qs('macroSummaryWrap');
    const macroResultCarbs = qs('macroResultCarbs');
    const macroResultProtein = qs('macroResultProtein');
    const macroResultFat = qs('macroResultFat');
    const macroResultBT = qs('macroResultBT');
    const macroResultState = qs('macroResultState');
    const macroCompletenessState = qs('macroCompletenessState');
    const useMacroInRatioCalculatorBtn = qs('useMacroInRatioCalculatorBtn');
    const useMacroInDoseModuleBtn = qs('useMacroInDoseModuleBtn');
    const calcCarbs = qs('calcCarbs');
    const calcMacroTransferStatus = qs('calcMacroTransferStatus');
    const doseLauncherBtn = qs('doseLauncherBtn');

    if (!launcher || !macroLauncherBtn || !macroContent || !macroBackBtn || !macroIngredientList || !macroEmptyState || !macroSummaryWrap || !macroResultCarbs || !macroResultProtein || !macroResultFat || !macroResultBT || !macroResultState || !macroCompletenessState || !useMacroInRatioCalculatorBtn) {
      return;
    }

    const state = {
      lastSummary: null
    };

    function dispatchMacroCleared(reason) {
      window.__cukrzycaPendingMacroForDose = null;
      window.dispatchEvent(new CustomEvent(MACRO_CLEARED_EVENT, {
        detail: {
          reason: reason || 'clear'
        }
      }));
    }

    function resetMacroModuleForNewPatient() {
      rebuildRows([createEmptyRow()]);
      if (macroHowToContent) {
        macroHowToContent.hidden = true;
      }
      if (macroHowToToggleBtn) {
        macroHowToToggleBtn.setAttribute('aria-expanded', 'false');
      }
      window.__cukrzycaPendingMacroForDose = null;
      let persisted = true;
      try {
        const ok = window.vildaDiabetesPersistence
          ? window.vildaDiabetesPersistence.removeKey('DIABETES_MACRO_BT_DRAFT')
          : false;
        if (!ok) persisted = saveDraftRows([createEmptyRow()]);
      } catch (error) {
        persisted = saveDraftRows([createEmptyRow()]);
      }
      return persisted;
    }

    function focusMacroHeading() {
      if (!macroMainHeading || typeof macroMainHeading.focus !== 'function') return;
      macroMainHeading.setAttribute('tabindex', '-1');
      requestAnimationFrame(function () {
        macroMainHeading.focus({ preventScroll: true });
      });
    }

    function openMacroModule() {
      if (launcher) {
        launcher.hidden = true;
      }
      if (learningContent) {
        learningContent.hidden = true;
      }
      if (calculatorContent) {
        calculatorContent.hidden = true;
      }
      macroContent.hidden = false;
      macroLauncherBtn.setAttribute('aria-expanded', 'true');
      if (moduleLauncherBtn) {
        moduleLauncherBtn.setAttribute('aria-expanded', 'false');
      }
      if (calculatorLauncherBtn) {
        calculatorLauncherBtn.setAttribute('aria-expanded', 'false');
      }
      focusMacroHeading();
    }

    function closeMacroModule() {
      macroContent.hidden = true;
      if (launcher) {
        launcher.hidden = false;
      }
      macroLauncherBtn.setAttribute('aria-expanded', 'false');
      requestAnimationFrame(function () {
        macroLauncherBtn.focus({ preventScroll: true });
        if (launcher && typeof launcher.scrollIntoView === 'function') {
          launcher.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    function getRowElements() {
      return Array.from(macroIngredientList.querySelectorAll('[data-role="macro-row"]'));
    }

    function collectRowData(rowEl) {
      const read = function (field) {
        const input = rowEl.querySelector('[data-field="' + field + '"]');
        return input ? input.value : '';
      };
      return {
        name: read('name'),
        mass: read('mass'),
        carbs100: read('carbs100'),
        protein100: read('protein100'),
        fat100: read('fat100')
      };
    }

    function persistDraft() {
      saveDraftRows(getRowElements().map(collectRowData));
    }

    function updateRowIndices() {
      const rows = getRowElements();
      rows.forEach(function (rowEl, index) {
        const indexEl = rowEl.querySelector('.diab-macro-row__index');
        const removeBtn = rowEl.querySelector('[data-action="remove-row"]');
        if (indexEl) {
          indexEl.textContent = 'Składnik ' + (index + 1);
        }
        if (removeBtn) {
          removeBtn.disabled = rows.length === 1;
          removeBtn.setAttribute('aria-disabled', String(rows.length === 1));
        }
      });
    }

    function buildRowChipHtml(label, value, modifier) {
      const classes = ['diab-macro-chip'];
      if (modifier) {
        classes.push('diab-macro-chip--' + modifier);
      }
      return '<span class="' + classes.join(' ') + '"><strong>' + label + ':</strong> ' + value + '</span>';
    }

    function analyzeRow(rowEl) {
      const data = collectRowData(rowEl);
      if (isRowDataEmpty(data)) {
        return { empty: true, raw: data };
      }

      const mass = parseLocaleNumber(data.mass);
      const carbs100Input = parseLocaleNumber(data.carbs100);
      const protein100Input = parseLocaleNumber(data.protein100);
      const fat100Input = parseLocaleNumber(data.fat100);
      const numericValues = [mass, carbs100Input, protein100Input, fat100Input];

      if (numericValues.some(function (value) { return Number.isFinite(value) && value < 0; })) {
        return {
          empty: false,
          valid: false,
          message: 'Wartości nie mogą być ujemne.'
        };
      }

      if (!Number.isFinite(mass) || mass <= 0) {
        return {
          empty: false,
          valid: false,
          message: 'Podaj masę porcji w gramach.'
        };
      }

      const providedMacroCount = [carbs100Input, protein100Input, fat100Input].filter(function (value) {
        return Number.isFinite(value);
      }).length;

      if (!providedMacroCount) {
        return {
          empty: false,
          valid: false,
          message: 'Uzupełnij przynajmniej jedną wartość odżywczą na 100 g.'
        };
      }

      const carbs100 = Number.isFinite(carbs100Input) ? carbs100Input : 0;
      const protein100 = Number.isFinite(protein100Input) ? protein100Input : 0;
      const fat100 = Number.isFinite(fat100Input) ? fat100Input : 0;

      const carbsPortion = mass * carbs100 / 100;
      const proteinPortion = mass * protein100 / 100;
      const fatPortion = mass * fat100 / 100;
      const btKcal = (proteinPortion * 4) + (fatPortion * 9);
      const macroSumTooHigh = [carbs100Input, protein100Input, fat100Input].every(function (value) {
        return Number.isFinite(value);
      }) && (carbs100Input + protein100Input + fat100Input > 100.5);

      return {
        empty: false,
        valid: true,
        raw: data,
        name: String(data.name || '').trim(),
        mass: mass,
        carbs100: carbs100,
        protein100: protein100,
        fat100: fat100,
        carbsPortion: carbsPortion,
        proteinPortion: proteinPortion,
        fatPortion: fatPortion,
        btKcal: btKcal,
        incomplete: {
          carbs: !Number.isFinite(carbs100Input),
          protein: !Number.isFinite(protein100Input),
          fat: !Number.isFinite(fat100Input)
        },
        macroSumTooHigh: macroSumTooHigh
      };
    }

    function renderRowState(rowEl, rowState) {
      const resultWrap = rowEl.querySelector('[data-role="row-result"]');
      const chipsWrap = rowEl.querySelector('[data-role="row-chips"]');
      const helpEl = rowEl.querySelector('[data-role="row-help"]');
      if (!resultWrap || !chipsWrap || !helpEl) return;

      if (!rowState || rowState.empty) {
        resultWrap.hidden = true;
        diabClearHtml(chipsWrap);
        helpEl.hidden = true;
        helpEl.textContent = '';
        helpEl.className = 'diab-help';
        return;
      }

      resultWrap.hidden = false;

      if (!rowState.valid) {
        diabClearHtml(chipsWrap);
        helpEl.hidden = false;
        helpEl.textContent = rowState.message || 'Uzupełnij dane składnika.';
        helpEl.className = 'diab-help diab-help--warn';
        return;
      }

      diabSetTrustedHtml(chipsWrap, [
        buildRowChipHtml('Węglowodany', formatNumber(rowState.carbsPortion, 1) + ' g'),
        buildRowChipHtml('Białko', formatNumber(rowState.proteinPortion, 1) + ' g'),
        buildRowChipHtml('Tłuszcz', formatNumber(rowState.fatPortion, 1) + ' g'),
        buildRowChipHtml('Ładunek białkowo-tłuszczowy', formatNumber(rowState.btKcal, 1) + ' kcal', rowState.btKcal > 200 ? 'warn' : '')
      ].join(''), 'macro row chips');

      const notes = [];
      if (rowState.incomplete.carbs) {
        notes.push('Brak wpisu dla węglowodanów — suma węglowodanów może być zaniżona.');
      }
      if (rowState.incomplete.protein || rowState.incomplete.fat) {
        notes.push('Brakuje danych dla białka lub tłuszczu — ocena ładunku białkowo-tłuszczowego (B/T) może być zaniżona.');
      }
      if (rowState.macroSumTooHigh) {
        notes.push('Sprawdź dane z etykiety — suma składników na 100 g jest nietypowo wysoka.');
      }

      if (notes.length) {
        helpEl.hidden = false;
        helpEl.textContent = notes.join(' ');
        helpEl.className = 'diab-help diab-help--warn';
      } else {
        helpEl.hidden = true;
        helpEl.textContent = '';
        helpEl.className = 'diab-help';
      }
    }

    function renderSummary(summary) {
      state.lastSummary = summary;
      if (!summary || !summary.validCount) {
        macroEmptyState.hidden = false;
        macroSummaryWrap.hidden = true;
        macroResultState.className = 'diab-macro-state';
        diabClearHtml(macroResultState);
        macroCompletenessState.hidden = true;
        macroCompletenessState.textContent = '';
        useMacroInRatioCalculatorBtn.disabled = true;
        if (useMacroInDoseModuleBtn) {
          useMacroInDoseModuleBtn.disabled = true;
        }
        return;
      }

      macroEmptyState.hidden = true;
      macroSummaryWrap.hidden = false;
      macroResultCarbs.textContent = formatNumber(summary.totals.carbs, 1) + ' g';
      macroResultProtein.textContent = formatNumber(summary.totals.protein, 1) + ' g';
      macroResultFat.textContent = formatNumber(summary.totals.fat, 1) + ' g';
      macroResultBT.textContent = formatNumber(summary.totals.btKcal, 1) + ' kcal';

      if (summary.totals.btKcal > 200) {
        macroResultState.className = 'diab-macro-state diab-macro-state--warn';
        diabSetTrustedHtml(macroResultState, '<strong>Ładunek białkowo-tłuszczowy (B/T) istotny:</strong> posiłek zawiera istotny ładunek białkowo-tłuszczowy. Może wpływać na glikemię także 2–4 godziny po posiłku.', 'cukrzyca:macro-result-state');
      } else {
        macroResultState.className = 'diab-macro-state';
        diabSetTrustedHtml(macroResultState, '<strong>Ładunek białkowo-tłuszczowy (B/T) niewielki:</strong> ładunek białkowo-tłuszczowy nie przekracza progu edukacyjnego 200 kcal.', 'cukrzyca:macro-result-state');
      }

      const warnings = [];
      if (summary.hasInvalidRows) {
        warnings.push('Niektóre składniki mają niepełne albo nieprawidłowe dane i nie zostały w pełni uwzględnione.');
      }
      if (summary.incompleteCarbs) {
        warnings.push('Brakuje części danych o węglowodanach — suma węglowodanów może być zaniżona.');
      }
      if (summary.incompleteBT) {
        warnings.push('Brakuje części danych o białku lub tłuszczu — ładunek białkowo-tłuszczowy (B/T) może być zaniżony.');
      }
      if (summary.totals.carbs <= 0) {
        warnings.push('Aby użyć wyniku w kalkulatorze przelicznika, suma węglowodanów musi być większa od zera.');
      }

      if (warnings.length) {
        macroCompletenessState.hidden = false;
        macroCompletenessState.textContent = warnings.join(' ');
      } else {
        macroCompletenessState.hidden = true;
        macroCompletenessState.textContent = '';
      }

      const canReuseCarbs = summary.totals.carbs > 0;
      useMacroInRatioCalculatorBtn.disabled = !canReuseCarbs;
      if (useMacroInDoseModuleBtn) {
        useMacroInDoseModuleBtn.disabled = !canReuseCarbs;
      }
    }

    function recalculateMacroModule() {
      const rows = getRowElements();
      const summary = {
        validCount: 0,
        totals: {
          carbs: 0,
          protein: 0,
          fat: 0,
          btKcal: 0
        },
        hasInvalidRows: false,
        incompleteCarbs: false,
        incompleteBT: false
      };

      rows.forEach(function (rowEl) {
        const rowState = analyzeRow(rowEl);
        renderRowState(rowEl, rowState);

        if (!rowState || rowState.empty) {
          return;
        }

        if (!rowState.valid) {
          summary.hasInvalidRows = true;
          return;
        }

        summary.validCount += 1;
        summary.totals.carbs += rowState.carbsPortion;
        summary.totals.protein += rowState.proteinPortion;
        summary.totals.fat += rowState.fatPortion;
        summary.totals.btKcal += rowState.btKcal;
        if (rowState.incomplete.carbs) {
          summary.incompleteCarbs = true;
        }
        if (rowState.incomplete.protein || rowState.incomplete.fat) {
          summary.incompleteBT = true;
        }
      });

      renderSummary(summary);
    }

    function onRowInput() {
      recalculateMacroModule();
      persistDraft();
    }

    function createRowElement(rowData) {
      const rowEl = document.createElement('div');
      rowEl.className = 'diab-macro-row';
      rowEl.dataset.role = 'macro-row';
      diabSetTrustedHtml(rowEl, [
        '<div class="diab-macro-row__head">',
        '  <span class="diab-macro-row__index"></span>',
        '  <button type="button" class="secondary-btn diab-macro-row__remove" data-action="remove-row">Usuń składnik</button>',
        '</div>',
        '<div class="diab-macro-row__fields">',
        '  <label class="diab-macro-row__field diab-macro-row__field--name">Nazwa składnika<input type="text" data-field="name" placeholder="np. chleb pszenny"></label>',
        '  <label class="diab-macro-row__field diab-macro-row__field--metric">Masa porcji [g]<input type="number" data-field="mass" min="0" step="0.1" inputmode="decimal" placeholder="np. 70"></label>',
        '  <label class="diab-macro-row__field diab-macro-row__field--metric">Węglowodany / 100 g<input type="number" data-field="carbs100" min="0" step="0.1" inputmode="decimal" placeholder="np. 41"></label>',
        '  <label class="diab-macro-row__field diab-macro-row__field--metric">Białko / 100 g<input type="number" data-field="protein100" min="0" step="0.1" inputmode="decimal" placeholder="np. 11"></label>',
        '  <label class="diab-macro-row__field diab-macro-row__field--metric">Tłuszcz / 100 g<input type="number" data-field="fat100" min="0" step="0.1" inputmode="decimal" placeholder="np. 4,3"></label>',
        '</div>',
        '<div class="diab-macro-row__result" data-role="row-result" hidden>',
        '  <div class="diab-macro-chips" data-role="row-chips"></div>',
        '  <p class="diab-help" data-role="row-help" hidden></p>',
        '</div>'
      ].join(''), 'macro row template');

      const data = sanitizeRowData(rowData);
      rowEl.querySelector('[data-field="name"]').value = data.name || '';
      rowEl.querySelector('[data-field="mass"]').value = data.mass || '';
      rowEl.querySelector('[data-field="carbs100"]').value = data.carbs100 || '';
      rowEl.querySelector('[data-field="protein100"]').value = data.protein100 || '';
      rowEl.querySelector('[data-field="fat100"]').value = data.fat100 || '';

      rowEl.querySelectorAll('input').forEach(function (input) {
        input.addEventListener('input', onRowInput);
        input.addEventListener('change', onRowInput);
      });

      const removeBtn = rowEl.querySelector('[data-action="remove-row"]');
      if (removeBtn) {
        removeBtn.addEventListener('click', function (event) {
          event.preventDefault();
          const rows = getRowElements();
          if (rows.length <= 1) {
            rowEl.querySelectorAll('input').forEach(function (input) {
              input.value = '';
            });
          } else {
            rowEl.remove();
          }
          updateRowIndices();
          recalculateMacroModule();
          persistDraft();
          if (!hasAnyMeaningfulRows()) {
            dispatchMacroCleared('remove-row');
          }
        });
      }

      return rowEl;
    }

    function rebuildRows(rowsData) {
      diabClearHtml(macroIngredientList);
      const normalizedRows = Array.isArray(rowsData) && rowsData.length ? rowsData : [createEmptyRow()];
      normalizedRows.forEach(function (rowData) {
        macroIngredientList.appendChild(createRowElement(rowData));
      });
      updateRowIndices();
      recalculateMacroModule();
      persistDraft();
    }

    function hasAnyMeaningfulRows() {
      return getRowElements().some(function (rowEl) {
        return !isRowDataEmpty(collectRowData(rowEl));
      });
    }

    function applyExample(key) {
      if (hasAnyMeaningfulRows()) {
        const ok = window.confirm('Czy chcesz zastąpić obecne składniki przykładowym posiłkiem z materiałów?');
        if (!ok) {
          return;
        }
      }
      rebuildRows(cloneExampleRows(key));
    }

    function transferToCalculator() {
      const summary = state.lastSummary;
      if (!summary || !summary.validCount || !(summary.totals.carbs > 0)) {
        macroCompletenessState.hidden = false;
        macroCompletenessState.textContent = 'Aby użyć wyniku w kalkulatorze przelicznika, wpisz przynajmniej jeden składnik i upewnij się, że suma węglowodanów jest większa od zera.';
        return;
      }

      if (calcCarbs) {
        calcCarbs.value = toInputValue(summary.totals.carbs, 1);
      }

      const messageParts = [
        'Przeniesiono <strong>' + formatNumber(summary.totals.carbs, 1) + ' g węglowodanów</strong> do pola „Węglowodany w posiłku”. W kroku 3 wpisz dane tego samego posiłku z dnia źródłowego (najczęściej z wczoraj).'
      ];
      if (summary.totals.btKcal > 200) {
        messageParts.push('Ładunek białkowo-tłuszczowy (B/T) przekracza 200 kcal — pamiętaj o ocenie późniejszej glikemii 2–4 h po posiłku.');
      }
      if (calcMacroTransferStatus) {
        calcMacroTransferStatus.hidden = false;
        calcMacroTransferStatus.className = 'diab-status diab-status--info';
        diabSetTrustedHtml(calcMacroTransferStatus, messageParts.join(' '), 'cukrzyca:macro-transfer-status');
      }

      window.dispatchEvent(new CustomEvent(MACRO_TRANSFER_TO_CALCULATOR_EVENT, {
        detail: {
          carbs: summary.totals.carbs,
          btKcal: summary.totals.btKcal,
          highFatProtein: summary.totals.btKcal > 200
        }
      }));

      macroContent.hidden = true;
      macroLauncherBtn.setAttribute('aria-expanded', 'false');
      if (calculatorLauncherBtn) {
        calculatorLauncherBtn.click();
      }
    }

    function createPendingMacroTransfer(summary) {
      if (!summary || !summary.validCount || !(summary.totals.carbs > 0)) {
        return null;
      }
      return {
        carbs: summary.totals.carbs,
        btKcal: summary.totals.btKcal,
        highFatProtein: summary.totals.btKcal > 200,
        createdAt: new Date().toISOString()
      };
    }

    function transferToDoseModule() {
      const summary = state.lastSummary;
      const pendingTransfer = createPendingMacroTransfer(summary);
      if (!pendingTransfer) {
        macroCompletenessState.hidden = false;
        macroCompletenessState.textContent = 'Aby użyć węglowodanów do obliczenia dawki insuliny, wpisz przynajmniej jeden składnik i upewnij się, że suma węglowodanów jest większa od zera.';
        return;
      }

      window.__cukrzycaPendingMacroForDose = pendingTransfer;

      macroContent.hidden = true;
      macroLauncherBtn.setAttribute('aria-expanded', 'false');
      if (doseLauncherBtn) {
        doseLauncherBtn.click();
      }
    }

    if (macroHowToToggleBtn && macroHowToContent) {
      macroHowToToggleBtn.addEventListener('click', function (event) {
        event.preventDefault();
        const isOpen = !macroHowToContent.hidden;
        macroHowToContent.hidden = isOpen;
        macroHowToToggleBtn.setAttribute('aria-expanded', String(!isOpen));
      });
    }

    macroLauncherBtn.addEventListener('click', function (event) {
      event.preventDefault();
      openMacroModule();
    });

    macroBackBtn.addEventListener('click', function (event) {
      event.preventDefault();
      closeMacroModule();
    });

    if (addMacroIngredientBtn) {
      addMacroIngredientBtn.addEventListener('click', function (event) {
        event.preventDefault();
        macroIngredientList.appendChild(createRowElement(createEmptyRow()));
        updateRowIndices();
        recalculateMacroModule();
        persistDraft();
      });
    }

    if (insertMacroExampleBtn) {
      insertMacroExampleBtn.addEventListener('click', function (event) {
        event.preventDefault();
        applyExample(DEFAULT_EXAMPLE_KEY);
      });
    }

    if (clearMacroFormBtn) {
      clearMacroFormBtn.addEventListener('click', function (event) {
        event.preventDefault();
        if (hasAnyMeaningfulRows()) {
          const ok = window.confirm('Czy chcesz usunąć wszystkie wpisane składniki i wyczyścić wynik?');
          if (!ok) {
            return;
          }
        }
        rebuildRows([createEmptyRow()]);
        dispatchMacroCleared('clear-button');
      });
    }

    macroExampleBtns.forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        const key = button.dataset && button.dataset.macroExample ? button.dataset.macroExample : DEFAULT_EXAMPLE_KEY;
        applyExample(key);
      });
    });

    useMacroInRatioCalculatorBtn.addEventListener('click', function (event) {
      event.preventDefault();
      transferToCalculator();
    });

    if (useMacroInDoseModuleBtn) {
      useMacroInDoseModuleBtn.addEventListener('click', function (event) {
        event.preventDefault();
        transferToDoseModule();
      });
    }

    window.addEventListener(CLEAR_ALL_EVENT, function (event) {
      const persisted = resetMacroModuleForNewPatient();
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : null;
      if (detail && persisted === false) {
        detail.storageOk = false;
      }
    });

    rebuildRows(loadDraftRows());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMacroModule);
  } else {
    initMacroModule();
  }
})();


(function () {
  'use strict';

  const SETTINGS_STORAGE_KEY = 'wagaiwzrost_cukrzyca_dawka_do_posilku_settings_v2';
  const LEGACY_SETTINGS_STORAGE_KEY = 'wagaiwzrost_cukrzyca_dawka_do_posilku_settings_v1';
  const RATIO_STORAGE_KEY = 'wagaiwzrost_cukrzyca_przeliczniki_doposilkowe_v1';

  function qs(id) {
    return document.getElementById(id);
  }

  function parseLocaleNumber(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : NaN;
    }
    const normalized = String(value == null ? '' : value)
      .trim()
      .replace(/\s+/g, '')
      .replace(/,/g, '.');
    if (!normalized) return NaN;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(value);
  }

  function capitalizeFirst(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function escapeHtml(value) {
    if (typeof window !== 'undefined' && window.VildaHtml && typeof window.VildaHtml.escapeHtml === 'function') {
      return window.VildaHtml.escapeHtml(value);
    }
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toLocalDateValue(date) {
    const value = date instanceof Date ? new Date(date.getTime()) : new Date();
    const offset = value.getTimezoneOffset() * 60000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 10);
  }

  function getYesterdayDateValue() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return toLocalDateValue(yesterday);
  }

  function normalizeDateValue(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : getYesterdayDateValue();
  }

  function formatDateLabel(value) {
    const normalized = normalizeDateValue(value);
    const parts = normalized.split('-').map((item) => Number(item));
    const date = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    return new Intl.DateTimeFormat('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function toInputValue(value, digits) {
    if (!Number.isFinite(value)) return '';
    const safeDigits = Number.isFinite(digits) ? Math.max(0, Math.min(6, digits)) : 0;
    const factor = Math.pow(10, safeDigits);
    const rounded = Math.round(value * factor) / factor;
    return safeDigits > 0 ? rounded.toFixed(safeDigits) : String(Math.round(rounded));
  }

  function normalizeSettings(raw) {
    const source = isPlainObject(raw) ? raw : {};
    const correctionThreshold = parseLocaleNumber(source.correctionThreshold);
    const targetGlucose = parseLocaleNumber(source.targetGlucose);
    return {
      correctionThreshold: Number.isFinite(correctionThreshold) && correctionThreshold >= 100 && correctionThreshold <= 250 ? Math.round(correctionThreshold) : 140,
      targetGlucose: Number.isFinite(targetGlucose) && targetGlucose >= 100 && targetGlucose <= 140 ? Math.round(targetGlucose) : 130,
      usePracticalValues: source.usePracticalValues !== false
    };
  }

  function loadSettings() {
    try {
      const parsed = window.vildaDiabetesPersistence
        ? (window.vildaDiabetesPersistence.readJSON('DIABETES_DOSE_SETTINGS', null)
          || window.vildaDiabetesPersistence.readJSON('DIABETES_DOSE_SETTINGS_LEGACY', null))
        : null;
      if (!parsed) return normalizeSettings(null);
      return normalizeSettings(parsed);
    } catch (error) {
      return normalizeSettings(null);
    }
  }

  function saveSettings(settings) {
    try {
      if (window.vildaDiabetesPersistence) {
        return window.vildaDiabetesPersistence.writeJSON('DIABETES_DOSE_SETTINGS', normalizeSettings(settings));
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  function loadRatioStore() {
    try {
      const parsed = window.vildaDiabetesPersistence
        ? window.vildaDiabetesPersistence.readJSON('DIABETES_MEAL_RATIOS', null)
        : null;
      if (!parsed || !isPlainObject(parsed) || !isPlainObject(parsed.days)) {
        return { version: 1, days: {} };
      }
      return parsed;
    } catch (error) {
      return { version: 1, days: {} };
    }
  }

  function getSavedMealEntry(store, dateValue, mealType) {
    const normalizedDate = normalizeDateValue(dateValue);
    const safeMealType = String(mealType || '').trim();
    if (!safeMealType) return null;
    const day = store && store.days && isPlainObject(store.days[normalizedDate])
      ? store.days[normalizedDate]
      : null;
    if (!day || !isPlainObject(day.meals)) return null;
    const entry = day.meals[safeMealType];
    return isPlainObject(entry) ? entry : null;
  }

  function showMessage(element, message, kind) {
    if (!element) return;
    element.hidden = !message;
    diabSetTrustedHtml(element, message || '', 'cukrzyca:status-message');
    element.className = 'diab-status';
    if (kind === 'success') {
      element.classList.add('diab-status--success');
    } else if (kind === 'info') {
      element.classList.add('diab-status--info');
    } else if (kind === 'warn') {
      element.classList.add('diab-status--warn');
    } else if (kind === 'danger') {
      element.classList.add('diab-status--danger');
    }
  }

  function hideMessage(element) {
    if (!element) return;
    element.hidden = true;
    diabClearHtml(element);
    element.className = 'diab-status';
  }

  function setNoteBoxContent(element, html, tone) {
    if (!element) return;
    element.hidden = !html;
    diabSetTrustedHtml(element, html || '', 'cukrzyca:note-box');
    element.className = 'diab-note-box diab-dose-note-box';
    if (!html) return;
    if (tone === 'accent') {
      element.classList.add('diab-note-box--accent');
    } else if (tone === 'warn') {
      element.classList.add('diab-note-box--warn');
    } else if (tone === 'danger') {
      element.classList.add('diab-note-box--danger');
    } else if (tone === 'soft') {
      element.classList.add('diab-note-box--soft');
    }
  }

  function buildDoseStatusMessage(title, subtitle) {
    return `<span class="diab-status__title">${escapeHtml(title)}</span><span class="diab-status__subtitle">${escapeHtml(subtitle)}</span>`;
  }

  function readSharedPersistSnapshot() {
    try {
      const adapter = (typeof window !== 'undefined' && window.VildaPersistence && typeof window.VildaPersistence.readSharedPersist === 'function')
        ? window.VildaPersistence
        : null;
      if (!adapter) return null;
      return adapter.readSharedPersist({ ensurePersist: false });
    } catch (error) {
      return null;
    }
  }

  function getStoredSharedWeightKg() {
    const liveField = qs('weight');
    const liveWeight = liveField ? parseLocaleNumber(liveField.value) : NaN;
    if (Number.isFinite(liveWeight) && liveWeight > 0) {
      return liveWeight;
    }

    const sharedSnapshot = readSharedPersistSnapshot();
    if (sharedSnapshot) {
      const root = sharedSnapshot.root && typeof sharedSnapshot.root === 'object' ? sharedSnapshot.root : {};
      const byId = sharedSnapshot.byId && typeof sharedSnapshot.byId === 'object' ? sharedSnapshot.byId : {};
      const sharedWeight = parseLocaleNumber(root.weight != null ? root.weight : byId.weight);
      if (Number.isFinite(sharedWeight) && sharedWeight > 0) {
        return sharedWeight;
      }
    }


    return NaN;
  }

  function getHypoglycemiaFastCarbInfo() {
    const weightKg = getStoredSharedWeightKg();
    if (Number.isFinite(weightKg) && weightKg > 0) {
      const grams = Math.max(1, Math.round(weightKg * 0.3));
      return {
        grams: grams,
        precise: true,
        message: buildDoseStatusMessage(
          `Orientacyjnie około ${formatNumber(grams, 0)} g szybko wchłanialnych węglowodanów`,
          'Po około 15 minutach wykonaj ponowny pomiar glikemii'
        )
      };
    }

    return {
      grams: NaN,
      precise: false,
      message: buildDoseStatusMessage(
        'Orientacyjnie 10–20 g szybko wchłanialnych węglowodanów',
        'Po około 15 minutach wykonaj ponowny pomiar glikemii'
      )
    };
  }

  function initDoseCorrectionModule() {
    const MACRO_CLEARED_EVENT = 'cukrzyca:macro-cleared';
    const RATIO_DAY_CLEARED_EVENT = 'cukrzyca:ratio-day-cleared';
    const CLEAR_ALL_EVENT = 'cukrzyca:clear-all-modules';

    const launcher = qs('moduleLauncher');
    const macroContent = qs('macroContent');
    const learningContent = qs('moduleContent');
    const calculatorContent = qs('calculatorContent');
    const doseContent = qs('doseContent');

    const macroLauncherBtn = qs('macroLauncherBtn');
    const moduleLauncherBtn = qs('moduleLauncherBtn');
    const calculatorLauncherBtn = qs('calculatorLauncherBtn');
    const doseLauncherBtn = qs('doseLauncherBtn');
    const doseBackBtn = qs('doseBackBtn');
    const doseMainHeading = qs('doseMainHeading');
    const doseSettingsToggleBtn = qs('doseSettingsToggleBtn');
    const doseSettingsContent = qs('doseSettingsContent');

    const doseRatioDate = qs('doseRatioDate');
    const doseMealType = qs('doseMealType');
    const doseCarbs = qs('doseCarbs');
    const doseGlucoseBefore = qs('doseGlucoseBefore');
    const doseRatioValue = qs('doseRatioValue');
    const doseSensitivityValue = qs('doseSensitivityValue');
    const doseCorrectionThreshold = qs('doseCorrectionThreshold');
    const doseTargetGlucose = qs('doseTargetGlucose');
    const doseUsePracticalValues = qs('doseUsePracticalValues');
    const doseUseExactValues = qs('doseUseExactValues');
    const doseRapidGapYes = qs('doseRapidGapYes');
    const doseRapidGapNo = qs('doseRapidGapNo');
    const doseBtNormal = qs('doseBtNormal');
    const doseBtHigh = qs('doseBtHigh');
    const doseValueSourceInputs = document.querySelectorAll('input[name="doseValueSource"]');
    const doseRapidGapInputs = document.querySelectorAll('input[name="doseRapidGap"]');
    const doseFatProteinInputs = document.querySelectorAll('input[name="doseFatProtein"]');
    const doseCalculatorForm = qs('doseCalculatorForm');
    const doseClearBtn = qs('doseClearBtn');
    const doseSavedRatioStatus = qs('doseSavedRatioStatus');
    const doseMacroTransferStatus = qs('doseMacroTransferStatus');
    const doseStatus = qs('doseStatus');

    const doseResultCard = qs('doseResultCard');
    const doseResultMeta = qs('doseResultMeta');
    const doseModeBadge = qs('doseModeBadge');
    const doseResultAlert = qs('doseResultAlert');
    const doseHypoCarbsAlert = qs('doseHypoCarbsAlert');
    const doseMetricsWrap = qs('doseMetricsWrap');
    const doseMealDoseValue = qs('doseMealDoseValue');
    const doseCorrectionDoseValue = qs('doseCorrectionDoseValue');
    const doseTotalDoseValue = qs('doseTotalDoseValue');
    const doseRatioDisplayValue = qs('doseRatioDisplayValue');
    const doseTotalDoseLabel = qs('doseTotalDoseLabel');
    const doseTotalMetric = qs('doseTotalMetric');
    const doseMealDoseMetric = qs('doseMealDoseMetric');
    const doseCorrectionDoseMetric = qs('doseCorrectionDoseMetric');
    const doseRatioMetric = qs('doseRatioMetric');
    const doseBreakdown = qs('doseBreakdown');
    const doseTimingNote = qs('doseTimingNote');
    const doseFatProteinNote = qs('doseFatProteinNote');
    const doseThresholdNote = qs('doseThresholdNote');

    const calcDate = qs('calcDate');
    const calcMealType = qs('calcMealType');

    if (!launcher || !doseContent || !doseLauncherBtn || !doseBackBtn || !doseMainHeading || !doseSettingsToggleBtn || !doseSettingsContent || !doseRatioDate || !doseMealType || !doseCarbs || !doseGlucoseBefore || !doseRatioValue || !doseSensitivityValue || !doseCorrectionThreshold || !doseTargetGlucose || !doseUsePracticalValues || !doseUseExactValues || !doseRapidGapYes || !doseRapidGapNo || !doseBtNormal || !doseBtHigh || !doseValueSourceInputs.length || !doseRapidGapInputs.length || !doseFatProteinInputs.length || !doseCalculatorForm || !doseSavedRatioStatus || !doseMacroTransferStatus || !doseStatus || !doseResultCard || !doseResultMeta || !doseModeBadge || !doseResultAlert || !doseHypoCarbsAlert || !doseMetricsWrap || !doseMealDoseValue || !doseCorrectionDoseValue || !doseTotalDoseValue || !doseRatioDisplayValue || !doseTotalDoseLabel || !doseTotalMetric || !doseMealDoseMetric || !doseCorrectionDoseMetric || !doseRatioMetric || !doseBreakdown || !doseTimingNote || !doseFatProteinNote || !doseThresholdNote) {
      return;
    }

    const state = {
      ratioStore: loadRatioStore(),
      settings: loadSettings(),
      autoFilledRatio: false,
      autoFilledSensitivity: false,
      lastLoadedEntry: null,
      lastLoadedMeta: null,
      macroTransfer: null
    };

    function focusHeading() {
      if (!doseMainHeading || typeof doseMainHeading.focus !== 'function') return;
      doseMainHeading.setAttribute('tabindex', '-1');
      requestAnimationFrame(function () {
        doseMainHeading.focus({ preventScroll: true });
      });
    }

    function setDoseSettingsExpanded(expanded) {
      const isExpanded = Boolean(expanded);
      doseSettingsContent.hidden = !isExpanded;
      doseSettingsToggleBtn.setAttribute('aria-expanded', String(isExpanded));
    }

    function readSettingsFromUi() {
      return normalizeSettings({
        correctionThreshold: parseLocaleNumber(doseCorrectionThreshold.value),
        targetGlucose: parseLocaleNumber(doseTargetGlucose.value),
        usePracticalValues: Boolean(doseUsePracticalValues.checked)
      });
    }

    function applySettingsToUi() {
      const usePractical = Boolean(state.settings.usePracticalValues);
      doseCorrectionThreshold.value = String(state.settings.correctionThreshold);
      doseTargetGlucose.value = String(state.settings.targetGlucose);
      doseUsePracticalValues.checked = usePractical;
      doseUseExactValues.checked = !usePractical;
    }

    function persistSettings() {
      state.settings = readSettingsFromUi();
      saveSettings(state.settings);
    }

    function resetDoseSettingsToDefaults() {
      state.settings = normalizeSettings(null);
      applySettingsToUi();
      let persisted = true;
      try {
        if (window.vildaDiabetesPersistence) {
          const okCurrent = window.vildaDiabetesPersistence.removeKey('DIABETES_DOSE_SETTINGS');
          const okLegacy = window.vildaDiabetesPersistence.removeKey('DIABETES_DOSE_SETTINGS_LEGACY');
          persisted = okCurrent && okLegacy;
        } else {
          persisted = false;
        }
      } catch (error) {
        persisted = false;
        // brak dostępu do pamięci nie blokuje czyszczenia pól na stronie
      }
      return persisted;
    }

    function clearResultCard() {
      doseResultCard.hidden = true;
      doseResultCard.className = 'card diab-card diab-dose-panel diab-dose-result';
      hideMessage(doseResultAlert);
      hideMessage(doseHypoCarbsAlert);
      doseMetricsWrap.hidden = true;
      doseResultMeta.textContent = '—';
      doseModeBadge.textContent = '—';
      doseModeBadge.className = 'diab-badge';
      doseTotalDoseLabel.textContent = 'Łączna dawka';
      doseMealDoseValue.textContent = '—';
      doseCorrectionDoseValue.textContent = '—';
      doseTotalDoseValue.textContent = '—';
      doseRatioDisplayValue.textContent = '—';
      doseMealDoseMetric.hidden = false;
      doseCorrectionDoseMetric.hidden = false;
      doseRatioMetric.hidden = false;
      setNoteBoxContent(doseBreakdown, '', 'soft');
      setNoteBoxContent(doseTimingNote, '', 'soft');
      setNoteBoxContent(doseFatProteinNote, '', 'soft');
      setNoteBoxContent(doseThresholdNote, '', 'soft');
    }

    function clearLoadedSummary() {
      state.lastLoadedEntry = null;
      state.lastLoadedMeta = null;
    }

    function hasAnyLoadedRatioFields() {
      return Boolean(state.autoFilledRatio || state.autoFilledSensitivity);
    }

    function hasFullLoadedRatioFields() {
      return Boolean(state.autoFilledRatio && state.autoFilledSensitivity && state.lastLoadedMeta);
    }

    function clearLoadedRatioLink(options) {
      const opts = options || {};
      let changed = false;

      if (state.autoFilledRatio) {
        if (doseRatioValue.value !== '') {
          doseRatioValue.value = '';
          changed = true;
        }
      }
      if (state.autoFilledSensitivity) {
        if (doseSensitivityValue.value !== '') {
          doseSensitivityValue.value = '';
          changed = true;
        }
      }

      state.autoFilledRatio = false;
      state.autoFilledSensitivity = false;
      clearLoadedSummary();
      if (opts.hideStatus !== false) {
        hideMessage(doseSavedRatioStatus);
      }
      if (changed && opts.clearResult !== false) {
        hideMessage(doseStatus);
        clearResultCard();
      }
      return changed;
    }

    function detachLoadedRatioField(fieldName) {
      if (fieldName === 'ratio') {
        state.autoFilledRatio = false;
      } else if (fieldName === 'sensitivity') {
        state.autoFilledSensitivity = false;
      }
      hideMessage(doseSavedRatioStatus);
      if (!hasAnyLoadedRatioFields()) {
        clearLoadedSummary();
      }
    }

    function rememberMacroTransfer(pending) {
      const carbs = Number(pending && pending.carbs);
      if (!Number.isFinite(carbs) || carbs <= 0) {
        state.macroTransfer = null;
        return;
      }
      state.macroTransfer = {
        carbsLinked: true,
        btLinked: Boolean(pending && pending.highFatProtein),
        carbsValue: toInputValue(carbs, 1),
        highFatProtein: Boolean(pending && pending.highFatProtein)
      };
    }

    function clearMacroTransferState() {
      state.macroTransfer = null;
    }

    function detachMacroTransferField(fieldName) {
      if (!state.macroTransfer) {
        hideMessage(doseMacroTransferStatus);
        return;
      }
      if (fieldName === 'carbs') {
        state.macroTransfer.carbsLinked = false;
      } else if (fieldName === 'bt') {
        state.macroTransfer.btLinked = false;
      }
      hideMessage(doseMacroTransferStatus);
      if (!state.macroTransfer.carbsLinked && !state.macroTransfer.btLinked) {
        clearMacroTransferState();
      }
    }

    function clearLinkedMacroTransferFields(options) {
      const opts = options || {};
      let changed = false;

      hideMessage(doseMacroTransferStatus);
      window.__cukrzycaPendingMacroForDose = null;

      if (state.macroTransfer) {
        if (state.macroTransfer.carbsLinked) {
          if (doseCarbs.value !== '') {
            doseCarbs.value = '';
            changed = true;
          }
        }
        if (state.macroTransfer.btLinked && doseBtHigh.checked) {
          doseBtNormal.checked = true;
          doseBtHigh.checked = false;
          changed = true;
        }
      }

      clearMacroTransferState();
      if (changed && opts.clearResult !== false) {
        hideMessage(doseStatus);
        clearResultCard();
      }
      return changed;
    }

    function getAutofillValues(entry) {
      const usePractical = Boolean(doseUsePracticalValues.checked);
      const ratio = usePractical ? Number(entry && entry.ratioRounded) : Number(entry && entry.ratioExact);
      const sensitivity = usePractical ? Number(entry && entry.sensitivityPractical) : Number(entry && entry.sensitivityExact);
      return {
        usePractical: usePractical,
        ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : NaN,
        sensitivity: Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : NaN
      };
    }

    function fillRatioAndSensitivity(values) {
      if (Number.isFinite(values.ratio) && values.ratio > 0) {
        doseRatioValue.value = toInputValue(values.ratio, values.usePractical ? 0 : 2);
      }
      if (Number.isFinite(values.sensitivity) && values.sensitivity > 0) {
        doseSensitivityValue.value = toInputValue(values.sensitivity, values.usePractical ? 0 : 2);
      }
    }

    function clearRatioAndSensitivity() {
      doseRatioValue.value = '';
      doseSensitivityValue.value = '';
    }

    function syncFromRatioCalculator() {
      if (calcDate && calcDate.value) {
        doseRatioDate.value = normalizeDateValue(calcDate.value);
      } else if (!doseRatioDate.value) {
        doseRatioDate.value = getYesterdayDateValue();
      }

      if (calcMealType && calcMealType.value) {
        doseMealType.value = calcMealType.value;
      }
    }

    function syncFromPendingMacroTransfer() {
      hideMessage(doseMacroTransferStatus);
      const pending = window.__cukrzycaPendingMacroForDose;
      if (!pending || !Number.isFinite(Number(pending.carbs)) || Number(pending.carbs) <= 0) {
        return;
      }

      window.__cukrzycaPendingMacroForDose = null;
      doseCarbs.value = toInputValue(Number(pending.carbs), 1);
      rememberMacroTransfer(pending);
      if (pending.highFatProtein) {
        doseBtHigh.checked = true;
        doseBtNormal.checked = false;
        showMessage(
          doseMacroTransferStatus,
          `Wczytano z kroku 1 <strong>${escapeHtml(formatNumber(Number(pending.carbs), 1))} g węglowodanów</strong> dla dzisiejszego posiłku. Posiłek ma też większy ładunek białka i tłuszczu, więc wynik potraktuj jako punkt wyjścia i zaplanuj kontrolę glikemii również <strong>2–4 godziny po jedzeniu</strong>.`,
          'warn'
        );
        return;
      }

      doseBtNormal.checked = true;
      doseBtHigh.checked = false;
      showMessage(
        doseMacroTransferStatus,
        `Wczytano z kroku 1 <strong>${escapeHtml(formatNumber(Number(pending.carbs), 1))} g węglowodanów</strong> dla dzisiejszego posiłku. Teraz dobierz przelicznik z kroku 3 i policz dawkę przed jedzeniem.`,
        'info'
      );
    }

    function autoLoadSavedEntry(showFeedback) {
      const mealType = String(doseMealType.value || '').trim();
      const dateValue = normalizeDateValue(doseRatioDate.value || getYesterdayDateValue());
      doseRatioDate.value = dateValue;

      state.ratioStore = loadRatioStore();
      hideMessage(doseSavedRatioStatus);

      if (!mealType) {
        clearLoadedRatioLink({ clearResult: true });
        if (showFeedback) {
          showMessage(doseSavedRatioStatus, 'Wybierz rodzaj posiłku, aby automatycznie wczytać dane z kroku 3.', 'info');
        }
        return;
      }

      const entry = getSavedMealEntry(state.ratioStore, dateValue, mealType);
      if (!entry) {
        clearLoadedRatioLink({ clearResult: true });
        if (showFeedback) {
          showMessage(
            doseSavedRatioStatus,
            `Brak zapisanego przelicznika dla <strong>${escapeHtml(capitalizeFirst(mealType))}</strong> w dniu <strong>${escapeHtml(formatDateLabel(dateValue))}</strong>. Wpisz przelicznik i insulinowrażliwość ręcznie.`,
            'info'
          );
        }
        return;
      }

      const values = getAutofillValues(entry);
      fillRatioAndSensitivity(values);
      state.autoFilledRatio = Number.isFinite(values.ratio) && values.ratio > 0;
      state.autoFilledSensitivity = Number.isFinite(values.sensitivity) && values.sensitivity > 0;
      state.lastLoadedEntry = entry;
      state.lastLoadedMeta = {
        dateValue: dateValue,
        mealType: mealType,
        usePractical: values.usePractical,
        ratio: values.ratio,
        sensitivity: values.sensitivity
      };
      if (showFeedback) {
        showMessage(
          doseSavedRatioStatus,
          `Wczytano zapisane dane dla <strong>${escapeHtml(capitalizeFirst(mealType))}</strong> z dnia <strong>${escapeHtml(formatDateLabel(dateValue))}</strong>.`,
          'success'
        );
      }
    }

    function openDoseModule() {
      launcher.hidden = true;
      if (macroContent) macroContent.hidden = true;
      if (learningContent) learningContent.hidden = true;
      if (calculatorContent) calculatorContent.hidden = true;
      doseContent.hidden = false;
      if (macroLauncherBtn) macroLauncherBtn.setAttribute('aria-expanded', 'false');
      if (moduleLauncherBtn) moduleLauncherBtn.setAttribute('aria-expanded', 'false');
      if (calculatorLauncherBtn) calculatorLauncherBtn.setAttribute('aria-expanded', 'false');
      doseLauncherBtn.setAttribute('aria-expanded', 'true');
      setDoseSettingsExpanded(false);
      syncFromRatioCalculator();
      autoLoadSavedEntry(Boolean(doseMealType.value));
      syncFromPendingMacroTransfer();
      focusHeading();
    }

    function closeDoseModule() {
      doseContent.hidden = true;
      doseLauncherBtn.setAttribute('aria-expanded', 'false');
      setDoseSettingsExpanded(false);
      launcher.hidden = false;
      if (typeof launcher.scrollIntoView === 'function') {
        launcher.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      requestAnimationFrame(function () {
        doseLauncherBtn.focus({ preventScroll: true });
      });
    }

    function collectFormData() {
      return {
        ratioDate: normalizeDateValue(doseRatioDate.value || getYesterdayDateValue()),
        mealType: String(doseMealType.value || '').trim(),
        carbs: parseLocaleNumber(doseCarbs.value),
        glucoseBefore: parseLocaleNumber(doseGlucoseBefore.value),
        ratio: parseLocaleNumber(doseRatioValue.value),
        sensitivity: parseLocaleNumber(doseSensitivityValue.value),
        correctionThreshold: parseLocaleNumber(doseCorrectionThreshold.value),
        targetGlucose: parseLocaleNumber(doseTargetGlucose.value),
        rapidGapOk: Boolean(doseRapidGapYes.checked),
        highFatProtein: Boolean(doseBtHigh.checked)
      };
    }

    function validateData(data) {
      if (!data.mealType) {
        return 'Wybierz rodzaj posiłku.';
      }
      if (!Number.isFinite(data.carbs) || data.carbs <= 0) {
        return 'Podaj liczbę gramów węglowodanów w dzisiejszym posiłku.';
      }
      if (!Number.isFinite(data.glucoseBefore) || data.glucoseBefore < 20) {
        return 'Podaj aktualną glikemię przed posiłkiem.';
      }
      if (!Number.isFinite(data.ratio) || data.ratio <= 0) {
        return 'Podaj przelicznik doposiłkowy w g/j.';
      }
      if (!Number.isFinite(data.sensitivity) || data.sensitivity <= 0) {
        return 'Podaj insulinowrażliwość w mg/dl na 1 j.';
      }
      if (!Number.isFinite(data.correctionThreshold) || data.correctionThreshold < 100 || data.correctionThreshold > 250) {
        return 'Ustaw próg glikemii do doliczania korekty w zakresie 100–250 mg/dl.';
      }
      if (!Number.isFinite(data.targetGlucose) || data.targetGlucose < 100 || data.targetGlucose > 140) {
        return 'Ustaw docelową glikemię po 3 h w zakresie 100–140 mg/dl.';
      }
      if (data.targetGlucose >= data.correctionThreshold) {
        return 'Docelowa glikemia po 3 h powinna być niższa niż próg rozpoczęcia korekty.';
      }
      return '';
    }

    function calculateDose(data) {
      const mealDose = data.carbs / data.ratio;
      const shouldApplyCorrection = data.glucoseBefore > data.correctionThreshold;
      const correctionDose = shouldApplyCorrection
        ? Math.max(0, (data.glucoseBefore - data.targetGlucose) / data.sensitivity)
        : 0;
      const totalDose = mealDose + correctionDose;

      if (data.glucoseBefore < 70) {
        return {
          mode: 'hypo',
          mealDose: mealDose,
          correctionDose: 0,
          totalDose: NaN,
          shouldApplyCorrection: false
        };
      }

      if (!data.rapidGapOk) {
        return {
          mode: 'wait',
          mealDose: mealDose,
          correctionDose: 0,
          totalDose: NaN,
          shouldApplyCorrection: false
        };
      }

      return {
        mode: shouldApplyCorrection ? 'mealAndCorrection' : 'mealOnly',
        mealDose: mealDose,
        correctionDose: correctionDose,
        totalDose: totalDose,
        shouldApplyCorrection: shouldApplyCorrection
      };
    }

    function buildBreakdownHtml(data, result) {
      const mealDoseText = escapeHtml(formatNumber(result.mealDose, 2));
      const ratioText = escapeHtml(formatNumber(data.ratio, 2));
      const carbsText = escapeHtml(formatNumber(data.carbs, 1));

      if (result.mode === 'hypo') {
        return '';
      }

      if (result.mode === 'wait') {
        return `
          <h3 class="diab-note-title">Najpierw zachowaj odstęp</h3>
          <p class="diab-footer-note">Od ostatniej insuliny szybkodziałającej nie minęły jeszcze <strong>2 godziny</strong>. Żeby ograniczyć nakładanie się dawek, nie licz teraz kolejnej pełnej dawki przed posiłkiem.</p>
          <p class="diab-footer-note"><strong>Informacyjnie:</strong> sama dawka na jedzenie wynikałaby ze wzoru <strong>${carbsText} g ÷ ${ratioText} g/j = ${mealDoseText} j</strong>, ale pełne obliczenie wykonaj po zachowaniu minimalnego odstępu.</p>
        `;
      }

      const correctionText = escapeHtml(formatNumber(result.correctionDose, 2));
      const totalText = escapeHtml(formatNumber(result.totalDose, 2));
      const correctionFormula = result.shouldApplyCorrection
        ? `<p class="diab-footer-note"><strong>Korekta:</strong> (${escapeHtml(formatNumber(data.glucoseBefore, 0))} − ${escapeHtml(formatNumber(data.targetGlucose, 0))}) ÷ ${escapeHtml(formatNumber(data.sensitivity, 2))} = <strong>${correctionText} j</strong>.</p>`
        : `<p class="diab-footer-note"><strong>Korekta:</strong> nie została doliczona, bo glikemia przed posiłkiem nie przekracza ustawionego progu <strong>${escapeHtml(formatNumber(data.correctionThreshold, 0))} mg/dl</strong>.</p>`;

      return `
        <h3 class="diab-note-title">Jak policzono wynik</h3>
        <p class="diab-footer-note"><strong>Insulina na jedzenie:</strong> ${carbsText} g ÷ ${ratioText} g/j = <strong>${mealDoseText} j</strong>.</p>
        ${correctionFormula}
        <p class="diab-footer-note"><strong>Łączna dawka:</strong> <strong>${totalText} j</strong>.</p>
      `;
    }

    function buildTimingNoteHtml(data, result) {
      if (result.mode === 'hypo') {
        return `
          <h3 class="diab-note-title">Kontrola po wyrównaniu</h3>
          <p class="diab-footer-note">Sprawdź glikemię ponownie po około <strong>15 minutach</strong>. Jeśli nadal jest poniżej <strong>70 mg/dl</strong>, ponownie podaj szybko wchłanialne węglowodany i jeszcze raz skontroluj wynik.</p>
        `;
      }

      if (result.mode === 'wait') {
        return `
          <h3 class="diab-note-title">Odstęp między dawkami</h3>
          <p class="diab-footer-note">Minimalny odstęp między kolejnymi dawkami insuliny szybkodziałającej to <strong>2 godziny</strong>, a najczęściej wygodniej planować posiłki co <strong>3–4 godziny</strong>. Powtórz obliczenie, gdy ten odstęp będzie zachowany.</p>
        `;
      }

      if (!result.shouldApplyCorrection) {
        return `
          <h3 class="diab-note-title">Odstęp między insuliną a jedzeniem</h3>
          <p class="diab-footer-note">Przy obecnym ustawieniu modułu i tej glikemii zwykle wystarcza krótki odstęp przed jedzeniem, najczęściej <strong>5–10 minut</strong>.</p>
        `;
      }

      return `
        <h3 class="diab-note-title">Odstęp między insuliną a jedzeniem</h3>
        <p class="diab-footer-note">Jeśli glikemia przed posiłkiem przekracza wybrany próg korekty, zwykle stosuje się dłuższy odstęp przed posiłkiem, najczęściej <strong>20–40 minut</strong>, zależnie od wysokości glikemii i indywidualnego planu leczenia.</p>
      `;
    }

    function buildThresholdNoteHtml(data, result) {
      if (result.mode === 'hypo' || result.mode === 'wait') {
        return '';
      }

      if (data.correctionThreshold > 140 && data.glucoseBefore > 140 && data.glucoseBefore <= data.correctionThreshold) {
        return `
          <h3 class="diab-note-title">Uwaga o progu korekty</h3>
          <p class="diab-footer-note">Masz glikemię przed posiłkiem <strong>${escapeHtml(formatNumber(data.glucoseBefore, 0))} mg/dl</strong>. Przy obecnym ustawieniu korekta zaczyna się dopiero <strong>powyżej ${escapeHtml(formatNumber(data.correctionThreshold, 0))} mg/dl</strong>, dlatego nie została doliczona. Próg korekty pozostaje ustawieniem modułu, bo w praktyce można pracować zarówno z granicą <strong>&gt;140 mg/dl</strong>, jak i <strong>&gt;160 mg/dl</strong>.</p>
        `;
      }

      return '';
    }

    function buildFatProteinNoteHtml(data, result) {
      if (!data.highFatProtein) {
        return '';
      }

      const body = result.mode === 'hypo'
        ? 'Po wyrównaniu glikemii wróć do pełnego obliczenia dawki i zaplanuj późniejszą kontrolę glikemii.'
        : result.mode === 'wait'
          ? 'Po zachowaniu minimalnego odstępu wróć do pełnego obliczenia dawki i zaplanuj późniejszą kontrolę glikemii.'
          : 'To obliczenie potraktuj jako punkt wyjścia do części węglowodanowej. Przy takim posiłku glikemia może jeszcze rosnąć 2–4 godziny po jedzeniu, dlatego zaplanuj także późniejszą kontrolę.';

      return `
        <h3 class="diab-note-title">Uwaga przy posiłku z większym ładunkiem B/T</h3>
        <p class="diab-footer-note">Posiłek ma istotny ładunek białka i tłuszczu (<strong>&gt;200 kcal</strong> z tych składników). ${body}</p>
      `;
    }

    function renderResult(data, result) {
      clearResultCard();
      doseResultCard.hidden = false;

      const mealLabel = capitalizeFirst(data.mealType);
      const useLoadedSource = hasFullLoadedRatioFields();
      const sourceLabel = useLoadedSource
        ? `dzień źródłowy przelicznika: ${formatDateLabel(state.lastLoadedMeta.dateValue)}`
        : 'przelicznik wpisany ręcznie';
      doseResultMeta.textContent = `${mealLabel} • ${sourceLabel} • glikemia przed posiłkiem: ${formatNumber(data.glucoseBefore, 0)} mg/dl`;

      doseMetricsWrap.hidden = false;
      hideMessage(doseHypoCarbsAlert);

      if (result.mode === 'hypo') {
        const hypoCarbInfo = getHypoglycemiaFastCarbInfo();
        doseResultCard.classList.add('diab-dose-result--hypo');
        doseModeBadge.textContent = 'Hipoglikemia';
        doseModeBadge.className = 'diab-badge diab-badge--danger';
        showMessage(doseResultAlert, buildDoseStatusMessage('Wyrównaj hipoglikemię', 'Dawkę insuliny oblicz po ponownym pomiarze glikemii'), 'danger');
        showMessage(doseHypoCarbsAlert, hypoCarbInfo.message, 'danger');
        doseMetricsWrap.hidden = true;
      } else if (result.mode === 'wait') {
        doseResultCard.classList.add('diab-dose-result--wait');
        doseModeBadge.textContent = 'Zachowaj odstęp';
        doseModeBadge.className = 'diab-badge diab-badge--warn';
        showMessage(doseResultAlert, 'Od ostatniej insuliny szybkodziałającej nie minęły jeszcze <strong>2 godziny</strong>. Żeby ograniczyć nakładanie się dawek, policz pełną dawkę dopiero po zachowaniu minimalnego odstępu.', 'warn');
        doseTotalDoseLabel.textContent = 'Postępowanie teraz';
        doseTotalDoseValue.textContent = 'Odczekaj minimum 2 h';
        doseMealDoseMetric.hidden = true;
        doseCorrectionDoseMetric.hidden = true;
        doseRatioMetric.hidden = true;
      } else if (result.mode === 'mealAndCorrection') {
        doseResultCard.classList.add('diab-dose-result--correction');
        doseModeBadge.textContent = 'Posiłek + korekta';
        doseModeBadge.className = 'diab-badge diab-badge--warn';
        showMessage(doseResultAlert, `Glikemia przed posiłkiem przekracza ustawiony próg <strong>${escapeHtml(formatNumber(data.correctionThreshold, 0))} mg/dl</strong>, dlatego do dawki na jedzenie została doliczona korekta.`, 'warn');
        doseMealDoseValue.textContent = `${formatNumber(result.mealDose, 2)} j`;
        doseCorrectionDoseValue.textContent = `${formatNumber(result.correctionDose, 2)} j`;
        doseTotalDoseValue.textContent = `${formatNumber(result.totalDose, 2)} j`;
        doseRatioDisplayValue.textContent = `${formatNumber(data.ratio, 2)} g/j`;
      } else {
        doseResultCard.classList.add('diab-dose-result--meal');
        doseModeBadge.textContent = 'Tylko posiłek';
        doseModeBadge.className = 'diab-badge diab-badge--ok';
        showMessage(doseResultAlert, `Glikemia przed posiłkiem nie przekracza ustawionego progu <strong>${escapeHtml(formatNumber(data.correctionThreshold, 0))} mg/dl</strong>, więc wyliczona została sama dawka na posiłek.`, 'success');
        doseMealDoseValue.textContent = `${formatNumber(result.mealDose, 2)} j`;
        doseCorrectionDoseValue.textContent = `${formatNumber(result.correctionDose, 2)} j`;
        doseTotalDoseValue.textContent = `${formatNumber(result.totalDose, 2)} j`;
        doseRatioDisplayValue.textContent = `${formatNumber(data.ratio, 2)} g/j`;
      }

      const breakdownHtml = buildBreakdownHtml(data, result);
      const timingNoteHtml = buildTimingNoteHtml(data, result);
      const fatProteinNoteHtml = buildFatProteinNoteHtml(data, result);
      const thresholdNoteHtml = buildThresholdNoteHtml(data, result);

      setNoteBoxContent(doseBreakdown, breakdownHtml, result.mode === 'hypo' ? 'danger' : result.mode === 'wait' ? 'warn' : 'soft');
      setNoteBoxContent(doseTimingNote, timingNoteHtml, result.mode === 'hypo' ? 'danger' : result.mode === 'wait' || result.mode === 'mealAndCorrection' ? 'warn' : 'soft');
      setNoteBoxContent(doseFatProteinNote, fatProteinNoteHtml, fatProteinNoteHtml ? 'warn' : 'soft');
      setNoteBoxContent(doseThresholdNote, thresholdNoteHtml, 'soft');

      if (typeof doseResultCard.scrollIntoView === 'function') {
        doseResultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function handleSubmit() {
      const data = collectFormData();
      const validationMessage = validateData(data);
      if (validationMessage) {
        showMessage(doseStatus, validationMessage, 'warn');
        clearResultCard();
        return;
      }

      hideMessage(doseStatus);
      const result = calculateDose(data);
      renderResult(data, result);
    }

    function clearFields() {
      doseMealType.value = '';
      doseCarbs.value = '';
      doseGlucoseBefore.value = '';
      doseRapidGapYes.checked = true;
      doseRapidGapNo.checked = false;
      doseBtNormal.checked = true;
      doseBtHigh.checked = false;
      clearRatioAndSensitivity();
      state.autoFilledRatio = false;
      state.autoFilledSensitivity = false;
      clearLoadedSummary();
      clearMacroTransferState();
      window.__cukrzycaPendingMacroForDose = null;
      hideMessage(doseSavedRatioStatus);
      hideMessage(doseMacroTransferStatus);
      hideMessage(doseStatus);
      clearResultCard();
    }

    function resetDoseModuleForNewPatient() {
      clearFields();
      doseRatioDate.value = getYesterdayDateValue();
      state.ratioStore = loadRatioStore();
      const persisted = resetDoseSettingsToDefaults();
      setDoseSettingsExpanded(false);
      return persisted;
    }

    setDoseSettingsExpanded(false);
    doseSettingsToggleBtn.addEventListener('click', function (event) {
      event.preventDefault();
      const shouldExpand = doseSettingsContent.hidden;
      setDoseSettingsExpanded(shouldExpand);
    });

    applySettingsToUi();
    doseRatioDate.value = getYesterdayDateValue();
    clearResultCard();

    doseLauncherBtn.addEventListener('click', function (event) {
      event.preventDefault();
      openDoseModule();
    });

    doseBackBtn.addEventListener('click', function (event) {
      event.preventDefault();
      closeDoseModule();
    });

    doseCalculatorForm.addEventListener('submit', function (event) {
      event.preventDefault();
      handleSubmit();
    });

    if (doseClearBtn) {
      doseClearBtn.addEventListener('click', function (event) {
        event.preventDefault();
        clearFields();
      });
    }

    doseRatioDate.addEventListener('change', function () {
      autoLoadSavedEntry(Boolean(doseMealType.value));
      hideMessage(doseStatus);
      clearResultCard();
    });

    doseMealType.addEventListener('change', function () {
      autoLoadSavedEntry(true);
      hideMessage(doseStatus);
      clearResultCard();
    });

    doseValueSourceInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        persistSettings();
        autoLoadSavedEntry(Boolean(doseMealType.value));
        hideMessage(doseStatus);
        clearResultCard();
      });
    });

    [doseCorrectionThreshold, doseTargetGlucose].forEach(function (field) {
      field.addEventListener('change', function () {
        persistSettings();
        hideMessage(doseStatus);
        clearResultCard();
      });
    });

    [doseRatioValue, doseSensitivityValue].forEach(function (field) {
      field.addEventListener('input', function () {
        if (field === doseRatioValue) {
          detachLoadedRatioField('ratio');
        } else {
          detachLoadedRatioField('sensitivity');
        }
        hideMessage(doseStatus);
        clearResultCard();
      });
    });

    [doseCarbs, doseGlucoseBefore].forEach(function (field) {
      field.addEventListener('input', function () {
        hideMessage(doseStatus);
        clearResultCard();
      });
    });

    doseCarbs.addEventListener('input', function () {
      detachMacroTransferField('carbs');
    });

    doseRapidGapInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        hideMessage(doseStatus);
        clearResultCard();
      });
    });

    doseFatProteinInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        detachMacroTransferField('bt');
        hideMessage(doseStatus);
        clearResultCard();
      });
    });

    window.addEventListener(MACRO_CLEARED_EVENT, function () {
      clearLinkedMacroTransferFields({ clearResult: true });
    });

    window.addEventListener(RATIO_DAY_CLEARED_EVENT, function (event) {
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      if (!detail.hadEntries) {
        return;
      }

      const clearedDate = normalizeDateValue(detail.dateValue || '');
      const selectedDate = normalizeDateValue(doseRatioDate.value || getYesterdayDateValue());
      const loadedDate = state.lastLoadedMeta ? normalizeDateValue(state.lastLoadedMeta.dateValue || '') : '';
      if (clearedDate !== selectedDate && clearedDate !== loadedDate) {
        return;
      }

      const removedLinkedFields = clearLoadedRatioLink({ clearResult: true });
      if (removedLinkedFields && selectedDate === clearedDate && doseMealType.value) {
        showMessage(
          doseSavedRatioStatus,
          `W kroku 3 wyczyszczono dzień <strong>${escapeHtml(formatDateLabel(clearedDate))}</strong>, więc usunięto też automatycznie wczytane dane dla <strong>${escapeHtml(capitalizeFirst(doseMealType.value))}</strong>.`,
          'info'
        );
      }
    });

    window.addEventListener(CLEAR_ALL_EVENT, function (event) {
      const persisted = resetDoseModuleForNewPatient();
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : null;
      if (detail && persisted === false) {
        detail.storageOk = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDoseCorrectionModule);
  } else {
    initDoseCorrectionModule();
  }
})();


(function () {
  'use strict';

  const CLEAR_ALL_EVENT = 'cukrzyca:clear-all-modules';

  function dispatchDiabetesClearAll(detail) {
    const payload = detail && typeof detail === 'object' ? detail : {};
    try {
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent(CLEAR_ALL_EVENT, { detail: payload }));
      } else {
        const ev = document.createEvent('CustomEvent');
        ev.initCustomEvent(CLEAR_ALL_EVENT, false, false, payload);
        window.dispatchEvent(ev);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function initSharedUserStateClearBridge() {
    if (window.__cukrzycaVildaUserStateBridgeBound || typeof window.addEventListener !== 'function') {
      return;
    }
    window.__cukrzycaVildaUserStateBridgeBound = true;
    function forwardVildaClearToDiabetes(event, reason) {
      const sourceDetail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      dispatchDiabetesClearAll({
        reason: reason || 'vilda-user-state-cleared',
        source: sourceDetail.source || '',
        storageOk: true
      });
    }

    window.addEventListener('vilda:user-state-cleared', function (event) {
      forwardVildaClearToDiabetes(event, 'vilda-user-state-cleared');
    });
    window.addEventListener('vilda:module-state-cleared', function (event) {
      const detail = event && event.detail && typeof event.detail === 'object' ? event.detail : {};
      const scope = String(detail.scope || 'all').toLowerCase();
      if (scope === 'all' || scope === '*' || scope === 'diabetes') {
        forwardVildaClearToDiabetes(event, 'vilda-module-state-cleared');
      }
    });
  }

  initSharedUserStateClearBridge();

  let clearAllTooltip = null;
  let clearAllTooltipHideTimer = null;
  let clearAllTooltipCleanupTimer = null;

  function qs(id) {
    return document.getElementById(id);
  }

  function ensureClearAllTooltip() {
    if (clearAllTooltip && clearAllTooltip.isConnected) {
      return clearAllTooltip;
    }
    const tooltip = document.createElement('div');
    tooltip.className = 'menu-tooltip copy-tooltip';
    tooltip.style.position = 'fixed';
    tooltip.style.display = 'none';
    tooltip.style.opacity = '0';
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.style.transform = 'translate(-50%, -100%) translateY(2px)';
    tooltip.setAttribute('role', 'status');
    tooltip.setAttribute('aria-live', 'polite');
    document.body.appendChild(tooltip);
    clearAllTooltip = tooltip;
    return tooltip;
  }

  function setTooltipPlacement(tooltip, placement, visible) {
    if (!tooltip) return;
    const safePlacement = placement === 'bottom' ? 'bottom' : 'top';
    tooltip.dataset.placement = safePlacement;
    if (safePlacement === 'bottom') {
      tooltip.style.transform = visible
        ? 'translate(-50%, 0) translateY(0px)'
        : 'translate(-50%, 0) translateY(-2px)';
      return;
    }
    tooltip.style.transform = visible
      ? 'translate(-50%, -100%) translateY(0px)'
      : 'translate(-50%, -100%) translateY(2px)';
  }

  function positionTooltipNearButton(tooltip, anchorEl) {
    if (!tooltip || !anchorEl) return;

    const rect = anchorEl.getBoundingClientRect();
    let left = Math.round(rect.left + rect.width / 2);
    tooltip.style.left = left + 'px';
    tooltip.style.top = Math.round(rect.top - 10) + 'px';
    setTooltipPlacement(tooltip, 'top', false);

    const tooltipRect = tooltip.getBoundingClientRect();
    const halfWidth = tooltipRect.width / 2;
    const minLeft = Math.round(12 + halfWidth);
    const maxLeft = Math.round(Math.max(minLeft, window.innerWidth - 12 - halfWidth));
    left = Math.min(Math.max(left, minLeft), maxLeft);

    const canShowAbove = rect.top - tooltipRect.height - 14 >= 0;
    if (canShowAbove) {
      tooltip.style.left = left + 'px';
      tooltip.style.top = Math.round(rect.top - 10) + 'px';
      setTooltipPlacement(tooltip, 'top', false);
      return;
    }

    let top = Math.round(rect.bottom + 10);
    const maxTop = Math.max(12, Math.round(window.innerHeight - tooltipRect.height - 12));
    top = Math.min(top, maxTop);
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    setTooltipPlacement(tooltip, 'bottom', false);
  }

  function showClearAllTooltip(anchorEl, message) {
    if (!anchorEl || !message) return;

    const tooltip = ensureClearAllTooltip();
    if (clearAllTooltipHideTimer) {
      window.clearTimeout(clearAllTooltipHideTimer);
    }
    if (clearAllTooltipCleanupTimer) {
      window.clearTimeout(clearAllTooltipCleanupTimer);
    }

    tooltip.textContent = message;
    tooltip.style.display = 'block';
    tooltip.style.opacity = '0';
    positionTooltipNearButton(tooltip, anchorEl);

    window.requestAnimationFrame(function () {
      positionTooltipNearButton(tooltip, anchorEl);
      tooltip.style.opacity = '1';
      setTooltipPlacement(tooltip, tooltip.dataset.placement || 'top', true);
    });

    clearAllTooltipHideTimer = window.setTimeout(function () {
      if (!clearAllTooltip) return;
      clearAllTooltip.style.opacity = '0';
      setTooltipPlacement(clearAllTooltip, clearAllTooltip.dataset.placement || 'top', false);
      clearAllTooltipCleanupTimer = window.setTimeout(function () {
        if (!clearAllTooltip) return;
        clearAllTooltip.style.display = 'none';
      }, 220);
    }, 1800);
  }

  function initClearAllModulesButton() {
    const clearAllBtn = qs('clearAllDiabetesModulesBtn');

    if (!clearAllBtn) {
      return;
    }

    clearAllBtn.addEventListener('click', function (event) {
      event.preventDefault();

      const detail = {
        reason: 'launcher-button',
        storageOk: true
      };
      try {
        if (window.vildaDiabetesPersistence && typeof window.vildaDiabetesPersistence.clearAll === 'function') {
          const clearResult = window.vildaDiabetesPersistence.clearAll('cukrzyca.clearAllDiabetesModulesBtn');
          if (clearResult && clearResult.ok === false) detail.storageOk = false;
        }
      } catch (error) {
        detail.storageOk = false;
      }
      dispatchDiabetesClearAll(detail);

      if (detail.storageOk === false) {
        showClearAllTooltip(clearAllBtn, 'Moduły wyczyszczono. Dla pewności odśwież stronę.');
        return;
      }

      showClearAllTooltip(clearAllBtn, 'Dane we wszystkich modułach zostały wyczyszczone.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClearAllModulesButton);
  } else {
    initClearAllModulesButton();
  }
})();
