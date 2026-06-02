/*
 * Vilda Diet Recommendations v1.1.0
 *
 * Wydzielony moduł zaleceń dietetycznych, ankiety personalizacji i eksportu PDF.
 * Zachowuje dotychczasowe globalne API używane przez app.js i VildaUpdatePrep.
 */
// =====================================================================
// Moduł: Zalecenia dietetyczne
// Funkcje definiujące logikę dla przycisku „Zalecenia dietetyczne”.  Ten
// moduł zostanie załadowany po głównym kodzie kalkulatora i korzysta z
// globalnych funkcji (BMR, proposeDiets, getLMS, copyToClipboard,
// showMetabolicToast) zdefiniowanych w innych częściach aplikacji.
(function() {
  const VILDA_DIET_RECOMMENDATIONS_VERSION = '1.1.0';
  if (typeof window !== 'undefined' && window.VildaDietRecommendations && window.VildaDietRecommendations.__vildaDietRecommendations) {
    return;
  }

  /**
   * Oblicza wiek w latach z uwzględnieniem części roku na podstawie pól
   * formularza „wiek (lata)” i „wiek (miesiące)”.
   * @returns {number}
   */
  function getAgeDecimalInternal() {
    const yearsEl = document.getElementById('age');
    const monthsEl = document.getElementById('ageMonths');
    const years = parseFloat(yearsEl && yearsEl.value) || 0;
    const months = parseFloat(monthsEl && monthsEl.value) || 0;
    return years + (months / 12);
  }


  function isPatientFacingDietMode() {
    const el = document.getElementById('patientFacingToggle');
    return !!(el && el.checked);
  }


  const DIET_PERSONALIZATION_MAX_GOALS = 3;
  const ENABLE_THERAPEUTIC_DIETS = false;

  /*
   * Przygotowana, ale domyślnie ukryta infrastruktura diet specjalistycznych.
   * Na tym etapie UI nie pokazuje tych profili użytkownikowi. Struktura zostaje
   * jednak w kodzie, żeby później można było łatwo aktywować moduły np. dla
   * dyslipidemii, insulinooporności, nadciśnienia lub stłuszczeniowej choroby wątroby.
   */
  const therapeuticDietProfiles = {
    dyslipidemia: {
      enabled: false,
      label: 'Dyslipidemia',
      requiredData: ['diagnosisOrLabs'],
      optionalData: ['LDL', 'HDL', 'TG', 'totalCholesterol', 'medications'],
      ageGroups: ['teen', 'adult'],
      priorityBlocks: ['fatQuality', 'fiber', 'plantSterols', 'bodyWeight', 'physicalActivity'],
      warning: 'Zalecenia przy dyslipidemii wymagają interpretacji w kontekście lipidogramu, ryzyka sercowo-naczyniowego i leczenia farmakologicznego.'
    },
    insulinResistance: {
      enabled: false,
      label: 'Insulinooporność / stan przedcukrzycowy',
      requiredData: ['diagnosisOrLabs'],
      ageGroups: ['teen', 'adult'],
      priorityBlocks: ['regularMeals', 'fiber', 'lowEnergyDensity', 'sweetDrinks', 'physicalActivity']
    },
    hypertension: {
      enabled: false,
      label: 'Nadciśnienie tętnicze',
      requiredData: ['diagnosisOrBloodPressure'],
      ageGroups: ['teen', 'adult'],
      priorityBlocks: ['saltReduction', 'vegetablesFruit', 'bodyWeight', 'alcoholReduction', 'physicalActivity']
    },
    fattyLiver: {
      enabled: false,
      label: 'Stłuszczeniowa choroba wątroby',
      requiredData: ['diagnosis'],
      ageGroups: ['teen', 'adult'],
      priorityBlocks: ['bodyWeight', 'sweetDrinks', 'alcoholReduction', 'lowEnergyDensity', 'physicalActivity']
    }
  };

  if (typeof window !== 'undefined') {
    window.dietTherapeuticDietProfiles = therapeuticDietProfiles;
    window.ENABLE_THERAPEUTIC_DIETS = ENABLE_THERAPEUTIC_DIETS;
  }


  const DIET_MYTH_RECENT_STORAGE_KEY = 'dietRecommendationsRecentMythsV1';
  const DIET_MYTH_RECENT_LIMIT = 5;
  let dietRecommendationsMythSelection = { signature: '', mythId: '' };
  let dietRecommendationsForceNewMyth = false;
  const dietRecommendationsLastOutputs = {
    smart: null,
    energy: null
  };

  const DIET_MYTH_LIBRARY = [
    {
      id: 'dinner_after_18',
      myth: 'Kolacji nie wolno jeść po 18:00.',
      fact: 'Ważniejsza jest pora snu, skład kolacji i całkowita ilość jedzenia w ciągu dnia. U wielu osób dobrze sprawdza się kolacja około 2–3 godziny przed snem.',
      practical: 'Jeśli pacjent chodzi spać później, nie trzeba pomijać kolacji. Lepiej zaplanować prosty posiłek z białkiem, warzywami i niewielką porcją produktu zbożowego lub ziemniaków.',
      tags: ['eveningSnacking', 'longGaps', 'skippedBreakfast', 'irregularMeals', 'regularMeals'],
      ageGroups: ['schoolChild', 'teen', 'adult'],
      baseWeight: 14
    },
    {
      id: 'fruit_evening',
      myth: 'Owoców nie powinno się jeść wieczorem.',
      fact: 'Owoce można jeść o różnych porach dnia. Ważniejsza jest całkowita ilość, przewaga warzyw nad owocami i cały jadłospis, a nie sama godzina zjedzenia owocu.',
      practical: 'Owoc może być częścią kolacji lub zaplanowanej przekąski, szczególnie jeśli zastępuje słodycze. Przy redukcji masy ważniejsza jest porcja i regularność niż zakaz konkretnej godziny.',
      tags: ['sweets', 'eveningSnacking', 'lowVegetablesFruit', 'childPickyVegetables'],
      ageGroups: ['schoolChild', 'teen', 'adult'],
      baseWeight: 12
    },
    {
      id: 'carbs_fattening',
      myth: 'Pieczywo, makaron i ziemniaki zawsze tuczą.',
      fact: 'O masie ciała decyduje przede wszystkim bilans energii i cały sposób żywienia. Problemem częściej są duże porcje, smażenie, tłuste sosy i dodatki, a nie sam produkt.',
      practical: 'Zamiast eliminować wszystkie węglowodany, wybieraj częściej pieczywo graham lub pełnoziarniste, kasze, ryż brązowy, makaron pełnoziarnisty oraz ziemniaki gotowane lub pieczone.',
      tags: ['lowWholeGrains', 'highFatAddons', 'restrictiveThinking', 'fastFood', 'saltySnacks', 'energyDensity'],
      ageGroups: ['schoolChild', 'teen', 'adult'],
      baseWeight: 13
    },
    {
      id: 'hunger_is_required',
      myth: 'Im większy głód, tym lepsza dieta.',
      fact: 'Silny, narastający głód zwykle nie jest dobrym znakiem. Może oznaczać zbyt duży deficyt energii, za mało białka, błonnika, warzyw albo zbyt długie przerwy między posiłkami.',
      practical: 'Zanim dalej obniżysz kaloryczność, popraw kompozycję posiłków: dodaj źródło białka, warzywa, produkt pełnoziarnisty i zadbaj o regularność.',
      tags: ['longGaps', 'eveningSnacking', 'poorSatietyRecognition', 'fastEating', 'irregularMeals', 'restrictiveThinking', 'rapidWeightLoss'],
      ageGroups: ['teen', 'adult'],
      baseWeight: 14
    },
    {
      id: 'very_low_calorie_diet',
      myth: 'Im mniej kalorii, tym lepiej — dieta 1000 kcal szybko rozwiąże problem.',
      fact: 'Bardzo niskokaloryczne diety często dają krótkotrwały efekt, nasilają głód i zmęczenie oraz zwiększają ryzyko podjadania, niedoborów i porzucenia planu.',
      practical: 'Bezpieczniejszy jest umiarkowany, możliwy do utrzymania plan: regularne posiłki, większa sytość, małe kroki i kontrolowane tempo redukcji.',
      tags: ['rapidWeightLoss', 'restrictiveThinking', 'strongHunger'],
      ageGroups: ['adult'],
      baseWeight: 10
    },
    {
      id: 'detox_weight_loss',
      myth: 'Detoks sokowy lub oczyszczający to dobry sposób na odchudzanie.',
      fact: 'Naturalne procesy usuwania zbędnych substancji zachodzą między innymi w wątrobie i nerkach. Restrykcyjne detoksy są zwykle krótkotrwałe i nie uczą codziennych nawyków.',
      practical: 'Zamiast detoksu lepiej wspierać organizm codziennie: wodą, warzywami, owocami, produktami pełnoziarnistymi, regularnym snem i aktywnością.',
      tags: ['dietTrends', 'rapidWeightLoss', 'restrictiveThinking'],
      ageGroups: ['teen', 'adult'],
      baseWeight: 9
    },
    {
      id: 'slow_metabolism',
      myth: 'Nie chudnę, bo mój metabolizm jest całkowicie zablokowany.',
      fact: 'Tempo przemiany materii zależy od wieku, płci, masy ciała, aktywności, stanu zdrowia, snu i sposobu żywienia. U części osób znaczenie mogą mieć choroby, ale często dużą rolę mają też codzienne nawyki.',
      practical: 'Jeśli mimo konsekwentnego planu masa długo się nie zmienia, sprawdź porcje, napoje, regularność, aktywność i sen. W razie wskazań warto omówić badania z lekarzem.',
      tags: ['noProgress', 'frustration', 'lowPhysicalActivity', 'adult', 'bodyWeight'],
      ageGroups: ['adult'],
      baseWeight: 8
    },
    {
      id: 'perfect_diet',
      myth: 'Dieta działa tylko wtedy, gdy trzymam się jej idealnie.',
      fact: 'Perfekcjonizm często prowadzi do schematu „wszystko albo nic”. Jeden słabszy posiłek nie przekreśla efektów i nie wymaga zaczynania od poniedziałku.',
      practical: 'Wróć do planu przy kolejnym posiłku. Nie kompensuj potknięcia głodówką — wybierz następny zwykły, zaplanowany posiłek.',
      tags: ['emotionalEating', 'sweets', 'fastFood', 'restrictiveThinking', 'allOrNothing', 'teen', 'adult'],
      ageGroups: ['teen', 'adult'],
      baseWeight: 15
    },
    {
      id: 'one_sweet_turns_to_fat',
      myth: 'Jeśli zjem coś słodkiego, od razu odłoży się to jako tłuszcz.',
      fact: 'Pojedynczy produkt nie decyduje o zmianie masy ciała. Znaczenie ma powtarzalność, ilość, bilans energii i cały jadłospis.',
      practical: 'Lepiej zaplanować rozsądną porcję niż traktować produkt jako całkowicie zakazany, po którym łatwiej o utratę kontroli.',
      tags: ['sweets', 'emotionalEating', 'restrictiveThinking', 'allOrNothing', 'foodReward'],
      ageGroups: ['teen', 'adult'],
      baseWeight: 11
    },
    {
      id: 'one_kg_failure',
      myth: 'Jeśli masa wzrosła o 1 kg, to plan nie działa.',
      fact: 'Masa ciała może naturalnie wahać się z dnia na dzień z powodu wody, treści pokarmowej, soli, aktywności, cyklu miesiączkowego lub rytmu wypróżnień.',
      practical: 'Oceniaj trend z kilku tygodni, a nie pojedynczy pomiar. Warto zapisywać też wykonane cele, aktywność i obwód talii, jeśli jest mierzony.',
      tags: ['frequentWeighing', 'frustration', 'noProgress', 'femaleWeightFluctuation', 'bodyWeight'],
      ageGroups: ['teen', 'adult'],
      baseWeight: 10
    },
    {
      id: 'small_loss_no_sense',
      myth: 'Mały spadek masy ciała nie ma znaczenia.',
      fact: 'Stopniowa redukcja bywa bezpieczniejsza i łatwiejsza do utrzymania. Liczą się też inne efekty: regularność, mniej podjadania, lepsza sprawność i lepsze samopoczucie.',
      practical: 'Oprócz masy ciała zapisuj wykonane małe kroki, obwód talii, aktywność i jakość posiłków. To pomaga zobaczyć postęp, którego nie pokazuje pojedynczy pomiar masy.',
      tags: ['frustration', 'noProgress', 'longTermChange', 'bodyWeight'],
      ageGroups: ['teen', 'adult'],
      baseWeight: 9
    },
    {
      id: 'day_is_lost',
      myth: 'Jeśli jeden posiłek nie wyszedł, cały dzień jest stracony.',
      fact: 'Jeden posiłek nie decyduje o efektach. Najważniejszy jest kolejny wybór i powrót do prostych zasad bez karania się głodem.',
      practical: 'Nie wyrównuj potknięcia głodówką. Zjedz kolejny normalny posiłek i wróć do jednego małego kroku z planu.',
      tags: ['emotionalEating', 'fastFood', 'sweets', 'restrictiveThinking', 'allOrNothing'],
      ageGroups: ['schoolChild', 'teen', 'adult'],
      baseWeight: 13
    },
    {
      id: 'food_as_reward_child',
      myth: 'Słodycze są najlepszą nagrodą dla dziecka.',
      fact: 'Jedzenie używane jako główna nagroda może wzmacniać jedzenie pod wpływem emocji i utrudniać rozpoznawanie sytości.',
      practical: 'Jako nagrodę częściej wybieraj uwagę rodzica, wspólną zabawę, naklejkę, dodatkowy czas na aktywność albo inną formę wsparcia bez jedzenia.',
      tags: ['foodReward', 'childSweetDrinks', 'child', 'youngChild', 'schoolChild'],
      ageGroups: ['youngChild', 'schoolChild'],
      baseWeight: 14
    },
    {
      id: 'clean_plate_child',
      myth: 'Dziecko powinno zawsze zjeść wszystko z talerza.',
      fact: 'Presja na „czyszczenie talerza” może osłabiać rozpoznawanie głodu i sytości. U dzieci ważniejszy jest spokojny rytm posiłków i regularna ekspozycja na produkty.',
      practical: 'Podawaj małe porcje i pozwól dziecku poprosić o dokładkę. Pomocne jest pytanie, czy brzuch jest już najedzony, zamiast namawiania do jedzenia do końca.',
      tags: ['childScreenEating', 'poorSatietyRecognition', 'childPickyVegetables', 'child'],
      ageGroups: ['youngChild', 'schoolChild'],
      baseWeight: 12
    }
  ];

  const DIET_MYTH_DEFAULT_IDS = {
    youngChild: ['food_as_reward_child', 'clean_plate_child'],
    schoolChild: ['day_is_lost', 'fruit_evening', 'carbs_fattening', 'clean_plate_child'],
    teen: ['perfect_diet', 'dinner_after_18', 'carbs_fattening', 'hunger_is_required', 'day_is_lost'],
    adult: ['perfect_diet', 'dinner_after_18', 'carbs_fattening', 'hunger_is_required', 'one_kg_failure']
  };

  if (typeof window !== 'undefined') {
    window.dietMythLibrary = DIET_MYTH_LIBRARY;
  }

  function dietRecommendationsReadRecentMythIds() {
    try {
      if (typeof window === 'undefined') return [];
      const persistence = window.VildaPersistence;
      const parsed = persistence && typeof persistence.readPreferenceJSON === 'function'
        ? persistence.readPreferenceJSON('DIET_MYTH_RECENT_IDS', [])
        : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String).slice(0, DIET_MYTH_RECENT_LIMIT) : [];
    } catch (_) {
      return [];
    }
  }

  function dietRecommendationsRememberMythId(id) {
    const value = String(id || '').trim();
    if (!value) return;
    try {
      if (typeof window === 'undefined') return;
      const persistence = window.VildaPersistence;
      if (!persistence || typeof persistence.writePreferenceJSON !== 'function') return;
      const recent = dietRecommendationsReadRecentMythIds().filter(function(item) { return item !== value; });
      recent.unshift(value);
      persistence.writePreferenceJSON('DIET_MYTH_RECENT_IDS', recent.slice(0, DIET_MYTH_RECENT_LIMIT), { force: true });
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 7856 });
    }
  }
  }

  function dietRecommendationsFindMythById(id) {
    const value = String(id || '').trim();
    if (!value) return null;
    return DIET_MYTH_LIBRARY.find(function(item) { return item.id === value; }) || null;
  }

  function dietRecommendationsBuildMythSignature(state) {
    const keys = state && Array.isArray(state.checkedKeys) ? state.checkedKeys.slice().sort() : [];
    const whr = state && state.ageGroup === 'adult' && hasAdultDietWhrRisk() ? 'whr' : '';
    return [
      state && state.ageGroup || 'adult',
      state && state.sex || '',
      state && state.strategy || '',
      state && state.patientFacing ? 'patient' : 'specialist',
      whr,
      keys.join(',')
    ].join('|');
  }

  function dietRecommendationsRequestNewMyth() {
    dietRecommendationsForceNewMyth = true;
  }

  function dietRecommendationsResetMythSelection() {
    dietRecommendationsMythSelection = { signature: '', mythId: '' };
    dietRecommendationsForceNewMyth = false;
  }

  function dietRecommendationsGetMythActiveTags(state) {
    const tags = new Set();
    if (!state) return [];
    (Array.isArray(state.checkedKeys) ? state.checkedKeys : []).forEach(function(key) { tags.add(key); });
    if (!state.surveyCompleted) {
      if (dietPersonalizationIsChildGroup(state.ageGroup)) {
        tags.add('child');
        tags.add('foodReward');
        tags.add('childPickyVegetables');
      } else if (state.ageGroup === 'teen') {
        tags.add('teen');
        tags.add('irregularMeals');
        tags.add('allOrNothing');
      } else {
        tags.add('adult');
        tags.add('regularMeals');
        tags.add('energyDensity');
        tags.add('allOrNothing');
      }
    }
    if (dietPersonalizationIsChildGroup(state.ageGroup)) tags.add('child');
    if (state.ageGroup === 'youngChild') tags.add('youngChild');
    if (state.ageGroup === 'schoolChild') tags.add('schoolChild');
    if (state.ageGroup === 'teen') tags.add('teen');
    if (state.ageGroup === 'adult') tags.add('adult');
    if (state.sex === 'F') tags.add('femaleWeightFluctuation');
    if (state.ageGroup === 'adult' && hasAdultDietWhrRisk()) tags.add('bodyWeight');
    if (hasDietPersonalizationAny(state, ['sweets', 'fastFood', 'emotionalEating'])) tags.add('allOrNothing');
    if (hasDietPersonalizationAny(state, ['rapidWeightLoss', 'dietTrends'])) tags.add('restrictiveThinking');
    if (hasDietPersonalizationAny(state, ['longGaps', 'eveningSnacking'])) tags.add('strongHunger');
    if (hasDietPersonalizationAny(state, ['noProgress', 'frequentWeighing'])) tags.add('frustration');
    return Array.from(tags);
  }

  function dietRecommendationsMythMatchesAge(myth, ageGroup) {
    if (!myth || !Array.isArray(myth.ageGroups) || !myth.ageGroups.length) return true;
    if (myth.ageGroups.indexOf(ageGroup) !== -1) return true;
    if (dietPersonalizationIsChildGroup(ageGroup) && myth.ageGroups.indexOf('child') !== -1) return true;
    return false;
  }

  function dietRecommendationsScoreMyth(myth, activeTags) {
    const tags = Array.isArray(myth && myth.tags) ? myth.tags : [];
    const active = new Set(activeTags || []);
    let matches = 0;
    tags.forEach(function(tag) { if (active.has(tag)) matches += 1; });
    return (Number(myth && myth.baseWeight) || 0) + matches * 28;
  }

  function dietRecommendationsGetDefaultMythsForAge(ageGroup) {
    const ids = DIET_MYTH_DEFAULT_IDS[ageGroup] || DIET_MYTH_DEFAULT_IDS.adult;
    return ids.map(dietRecommendationsFindMythById).filter(Boolean);
  }

  function dietRecommendationsSelectMyth(state, options) {
    const opts = options || {};
    const ageGroup = state && state.ageGroup ? state.ageGroup : 'adult';
    const activeTags = dietRecommendationsGetMythActiveTags(state);
    const excluded = new Set();
    if (opts.excludeCurrentId) excluded.add(String(opts.excludeCurrentId));
    if (opts.excludeRecent) {
      dietRecommendationsReadRecentMythIds().forEach(function(id) { excluded.add(String(id)); });
    }

    let candidates = DIET_MYTH_LIBRARY
      .filter(function(myth) { return dietRecommendationsMythMatchesAge(myth, ageGroup); })
      .map(function(myth) {
        return Object.assign({}, myth, { _score: dietRecommendationsScoreMyth(myth, activeTags) });
      })
      .filter(function(myth) { return myth._score > 0; });

    const matchedCandidates = candidates.filter(function(myth) {
      const tags = Array.isArray(myth.tags) ? myth.tags : [];
      return tags.some(function(tag) { return activeTags.indexOf(tag) !== -1; });
    });
    if (matchedCandidates.length) candidates = matchedCandidates;
    if (!candidates.length) candidates = dietRecommendationsGetDefaultMythsForAge(ageGroup).map(function(myth) {
      return Object.assign({}, myth, { _score: Number(myth.baseWeight) || 10 });
    });

    let available = candidates.filter(function(myth) { return !excluded.has(myth.id); });
    if (!available.length && opts.excludeCurrentId) {
      available = candidates.filter(function(myth) { return myth.id !== opts.excludeCurrentId; });
    }
    if (!available.length) available = candidates;
    if (!available.length) return {
      id: 'perfect_diet_fallback',
      myth: 'Dieta musi być idealna każdego dnia.',
      fact: 'Celem jest powtarzalność większości dobrych wyborów, a nie perfekcja.',
      practical: 'Wróć do planu przy kolejnym posiłku i wybierz jeden mały krok, który jest realny do wykonania.'
    };

    const total = available.reduce(function(sum, myth) { return sum + Math.max(1, myth._score || 1); }, 0);
    let draw = Math.random() * total;
    for (let i = 0; i < available.length; i += 1) {
      draw -= Math.max(1, available[i]._score || 1);
      if (draw <= 0) return available[i];
    }
    return available[available.length - 1];
  }

  function dietRecommendationsEscapeHtml(value) {
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

  function getDietAdultStartAge() {
    return (typeof ENERGY_ADULT_START_AGE === 'number' && isFinite(ENERGY_ADULT_START_AGE))
      ? ENERGY_ADULT_START_AGE
      : 18;
  }

  function getDietPersonalizationAgeGroup(ageYears) {
    const adultStart = getDietAdultStartAge();
    const age = Number(ageYears);
    if (!Number.isFinite(age)) return 'adult';
    if (age >= adultStart) return 'adult';
    if (age >= 11) return 'teen';
    if (age >= 7) return 'schoolChild';
    return 'youngChild';
  }

  function getDietPersonalizationAgeLabel(ageGroup) {
    if (ageGroup === 'youngChild') return 'młodsze dziecko';
    if (ageGroup === 'schoolChild') return 'dziecko szkolne';
    if (ageGroup === 'teen') return 'nastolatek / nastolatka';
    return 'osoba dorosła';
  }

  function dietPersonalizationIsChildGroup(ageGroup) {
    return ageGroup === 'youngChild' || ageGroup === 'schoolChild';
  }

  function dietPersonalizationIsNonAdultGroup(ageGroup) {
    return ageGroup !== 'adult';
  }

  function getDietSurveyCheckboxes() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-diet-survey-key]'));
  }

  function buildDietSurveyMarkup() {
    return `
      <div id="dietPersonalizationModule" class="diet-personalization-module">
        <div class="diet-personalization-head">
          <div>
            <strong>Personalizacja zaleceń</strong>
            <p id="dietPersonalizationLead">Aplikacja może wybrać 2–3 najważniejsze kroki na najbliższe 2 tygodnie na podstawie krótkiej ankiety o nawykach.</p>
          </div>
          <button type="button" id="toggleDietSurveyBtn" class="diet-survey-toggle" aria-controls="dietSurveyPanel" aria-expanded="false">Dopasuj zalecenia do nawyków</button>
        </div>
        <div id="dietSurveyPanel" class="diet-survey-panel" hidden>
          <p class="diet-survey-help">Zaznacz tylko te obszary, które rzeczywiście dotyczą pacjenta. Nie trzeba wypełniać wszystkiego — aplikacja i tak pokaże maksymalnie 3 priorytety.</p>
          <div class="diet-survey-section" data-diet-age-target="youngChild schoolChild">
            <h4>Środowisko dziecka</h4>
            <div class="diet-survey-grid">
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="childSweetDrinks"> <span>w domu często są słodkie napoje</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="foodReward"> <span>słodycze bywają nagrodą</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="childPickyVegetables"> <span>dziecko niechętnie próbuje warzyw</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="childScreenEating"> <span>dziecko często je przy ekranie</span></label>
              <label class="diet-survey-chip" data-diet-age-target="schoolChild"><input type="checkbox" data-diet-survey-key="noSchoolMeal"> <span>brak posiłku do szkoły</span></label>
              <label class="diet-survey-chip" data-diet-age-target="schoolChild"><input type="checkbox" data-diet-survey-key="schoolSnacks"> <span>kupowanie słodyczy lub napojów w szkole</span></label>
            </div>
          </div>
          <div class="diet-survey-section">
            <h4>Rytm posiłków i przekąski</h4>
            <div class="diet-survey-grid">
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="irregularMeals"> <span>nieregularne posiłki</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="skippedBreakfast"> <span>pomijanie śniadania / pierwszego posiłku</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="longGaps"> <span>długie przerwy bez jedzenia</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="eveningSnacking"> <span>podjadanie wieczorem</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="sweetDrinks"> <span>słodzone napoje, soki lub energetyki</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="sweets"> <span>częste słodycze</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="saltySnacks"> <span>słone przekąski</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="fastFood"> <span>fast food / jedzenie na wynos</span></label>
            </div>
          </div>
          <div class="diet-survey-section">
            <h4>Jakość posiłków</h4>
            <div class="diet-survey-grid">
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="lowVegetablesFruit"> <span>mało warzyw i owoców</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="lowWholeGrains"> <span>mało produktów pełnoziarnistych</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="lowProtein"> <span>mało białka w posiłkach</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="highFatAddons"> <span>tłuste sosy, smażenie lub duże dodatki</span></label>
            </div>
          </div>
          <div class="diet-survey-section">
            <h4>Zachowania przy jedzeniu</h4>
            <div class="diet-survey-grid">
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="fastEating"> <span>szybkie jedzenie</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="screenEating"> <span>jedzenie przy telefonie / TV / komputerze</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="poorSatietyRecognition"> <span>trudność z rozpoznaniem sytości</span></label>
              <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="emotionalEating"> <span>jedzenie ze stresu, nudy lub emocji</span></label>
            </div>
          </div>
          <details class="diet-survey-more">
            <summary>Pokaż pytania dodatkowe</summary>
            <div class="diet-survey-section diet-survey-section--extra">
              <h4>Organizacja, preferencje i ograniczenia</h4>
              <div class="diet-survey-grid">
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="littleCookingTime"> <span>mało czasu na gotowanie</span></label>
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="poorMealPlanning"> <span>trudność z planowaniem zakupów</span></label>
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="eatingOutOften"> <span>częste jedzenie poza domem</span></label>
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="needsSimpleMeals"> <span>potrzeba bardzo prostych posiłków</span></label>
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="dislikesFish"> <span>pacjent nie lubi ryb</span></label>
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="noDairy"> <span>pacjent nie je nabiału</span></label>
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="vegetarian"> <span>dieta wegetariańska / roślinna</span></label>
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="allergiesOrIntolerances"> <span>alergie lub nietolerancje</span></label>
                <label class="diet-survey-chip" data-diet-age-target="adult"><input type="checkbox" data-diet-survey-key="alcohol"> <span>częste kalorie z alkoholu</span></label>
                <label class="diet-survey-chip"><input type="checkbox" data-diet-survey-key="lowPhysicalActivity"> <span>bardzo mało ruchu na co dzień</span></label>
                <label class="diet-survey-chip" data-diet-age-target="teen adult"><input type="checkbox" data-diet-survey-key="restrictiveThinking"> <span>podejście „wszystko albo nic”</span></label>
                <label class="diet-survey-chip" data-diet-age-target="teen adult"><input type="checkbox" data-diet-survey-key="rapidWeightLoss"> <span>chęć bardzo szybkiego odchudzania</span></label>
                <label class="diet-survey-chip" data-diet-age-target="teen adult"><input type="checkbox" data-diet-survey-key="dietTrends"> <span>detoksy, modne diety lub „oczyszczanie”</span></label>
                <label class="diet-survey-chip" data-diet-age-target="teen adult"><input type="checkbox" data-diet-survey-key="frequentWeighing"> <span>częste ważenie i stres wynikiem</span></label>
                <label class="diet-survey-chip" data-diet-age-target="teen adult"><input type="checkbox" data-diet-survey-key="noProgress"> <span>frustracja brakiem efektów</span></label>
              </div>
            </div>
          </details>
          <div class="diet-survey-footer">
            <button type="button" id="clearDietSurveyBtn" class="diet-survey-clear">Wyczyść ankietę</button>
            <span id="dietSurveyCounter" class="diet-survey-counter">Zaznaczono: 0</span>
          </div>
        </div>
      </div>
    `;
  }

  function ensureDietPersonalizationSurveyUi(content) {
    const container = content || document.getElementById('dietRecommendationsContent');
    if (!container) return null;
    let module = document.getElementById('dietPersonalizationModule');
    if (!module) {
      const temp = document.createElement('div');
      vildaAppSetTrustedHtml(temp, buildDietSurveyMarkup().trim(), 'app:temp');
      module = temp.firstElementChild;
      const generateBtn = document.getElementById('generateDietBtn');
      if (generateBtn && generateBtn.parentNode) {
        generateBtn.parentNode.insertBefore(module, generateBtn);
      } else {
        container.appendChild(module);
      }
    }
    attachDietPersonalizationControls();
    updateDietSurveyAgeVisibility();
    updateDietSurveyCounter();
    return module;
  }

  function getDietSurveyTargetTokens(value) {
    return String(value || '').split(/\s+/).map(function(v) { return v.trim(); }).filter(Boolean);
  }

  function shouldShowDietSurveyAgeTarget(tokens, ageGroup) {
    if (!tokens || !tokens.length) return true;
    if (tokens.indexOf('all') !== -1 || tokens.indexOf(ageGroup) !== -1) return true;
    if (tokens.indexOf('child') !== -1 && dietPersonalizationIsChildGroup(ageGroup)) return true;
    if (tokens.indexOf('nonAdult') !== -1 && dietPersonalizationIsNonAdultGroup(ageGroup)) return true;
    return false;
  }

  function updateDietSurveyAgeVisibility() {
    const ageGroup = getDietPersonalizationAgeGroup(getAgeDecimalInternal());
    const lead = document.getElementById('dietPersonalizationLead');
    if (lead) {
      if (ageGroup === 'youngChild' || ageGroup === 'schoolChild') {
        lead.textContent = 'Ankieta pomaga dobrać 2–3 małe kroki dla rodzica/opiekuna: rytm posiłków, napoje, warzywa, jedzenie bez ekranu i środowisko domowe.';
      } else if (ageGroup === 'teen') {
        lead.textContent = 'Ankieta pomaga dobrać 2–3 realistyczne cele dla nastolatka: regularność, szkoła, napoje, przekąski, sytość i jedzenie przy ekranie.';
      } else {
        lead.textContent = 'Ankieta pomaga dobrać 2–3 najważniejsze cele dla osoby dorosłej: regularność, gęstość energetyczna, talerz zdrowego żywienia, sytość i podjadanie.';
      }
    }
    Array.prototype.slice.call(document.querySelectorAll('[data-diet-age-target]')).forEach(function(el) {
      const tokens = getDietSurveyTargetTokens(el.getAttribute('data-diet-age-target'));
      const visible = shouldShowDietSurveyAgeTarget(tokens, ageGroup);
      el.style.display = visible ? '' : 'none';
      if (!visible) {
        Array.prototype.slice.call(el.querySelectorAll('[data-diet-survey-key]')).forEach(function(input) {
          input.checked = false;
        });
      }
    });
    updateDietSurveyCounter();
  }

  function updateDietSurveyCounter() {
    const counter = document.getElementById('dietSurveyCounter');
    if (!counter) return;
    const count = getDietSurveyCheckboxes().filter(function(input) { return input.checked; }).length;
    counter.textContent = 'Zaznaczono: ' + count;
  }

  function attachDietPersonalizationControls() {
    const toggleBtn = document.getElementById('toggleDietSurveyBtn');
    const panel = document.getElementById('dietSurveyPanel');
    if (toggleBtn && panel && !toggleBtn.dataset.dietSurveyAttached) {
      toggleBtn.addEventListener('click', function() {
        const shouldOpen = panel.hasAttribute('hidden');
        if (shouldOpen) {
          panel.removeAttribute('hidden');
        } else {
          panel.setAttribute('hidden', '');
        }
        toggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        toggleBtn.textContent = shouldOpen ? 'Ukryj ankietę' : 'Dopasuj zalecenia do nawyków';
      });
      toggleBtn.dataset.dietSurveyAttached = 'true';
    }
    const clearBtn = document.getElementById('clearDietSurveyBtn');
    if (clearBtn && !clearBtn.dataset.dietSurveyClearAttached) {
      clearBtn.addEventListener('click', function() {
        getDietSurveyCheckboxes().forEach(function(input) { input.checked = false; });
        Array.prototype.slice.call(document.querySelectorAll('.diet-survey-more')).forEach(function(details) {
          details.open = false;
        });
        updateDietSurveyCounter();
        dietRecommendationsResetMythSelection();
        resetDietSurveyGeneratedRecommendations();
      });
      clearBtn.dataset.dietSurveyClearAttached = 'true';
    }
    getDietSurveyCheckboxes().forEach(function(input) {
      if (!input.dataset.dietSurveyChangeAttached) {
        input.addEventListener('change', function() {
          updateDietSurveyCounter();
          refreshDietRecommendationsIfVisible();
        });
        input.dataset.dietSurveyChangeAttached = 'true';
      }
    });
  }

  function collectDietPersonalizationState() {
    const checkedKeys = [];
    const checked = {};
    getDietSurveyCheckboxes().forEach(function(input) {
      const key = input.getAttribute('data-diet-survey-key');
      if (!key) return;
      checked[key] = !!input.checked;
      if (input.checked) checkedKeys.push(key);
    });
    const age = getAgeDecimalInternal();
    const ageGroup = getDietPersonalizationAgeGroup(age);
    const sex = document.getElementById('sex')?.value || 'M';
    const patientFacing = isPatientFacingDietMode();
    const reduceToggleEl = document.getElementById('reduceToggle');
    const stabilizationToggleEl = document.getElementById('stabilizationToggle');
    let strategy = 'reduction';
    if (ageGroup !== 'adult' && stabilizationToggleEl && stabilizationToggleEl.checked && !(reduceToggleEl && reduceToggleEl.checked)) {
      strategy = 'stabilization';
    }
    return {
      surveyCompleted: checkedKeys.length > 0,
      checkedKeys,
      checked,
      age,
      ageGroup,
      sex,
      patientFacing,
      strategy,
      specialist: {
        enabled: ENABLE_THERAPEUTIC_DIETS,
        selectedProfiles: [],
        profiles: therapeuticDietProfiles
      }
    };
  }

  function hasDietPersonalizationAny(state, keys) {
    if (!state || !state.checked) return false;
    return keys.some(function(key) { return !!state.checked[key]; });
  }

  function addDietPersonalizationPriority(map, key, score, reason) {
    if (!map[key] || score > map[key].score) {
      map[key] = { key, score, reason: reason || '' };
    }
  }

  function scoreDietPriorities(state) {
    const map = {};
    if (!state || !state.surveyCompleted) {
      if (state && dietPersonalizationIsChildGroup(state.ageGroup)) {
        addDietPersonalizationPriority(map, 'waterDefault', 88, 'bez ankiety: bezpieczny pierwszy krok u dziecka');
        addDietPersonalizationPriority(map, 'vegetablesFruit', 84, 'bez ankiety: ekspozycja na warzywa');
        addDietPersonalizationPriority(map, 'screenFreeMeal', 76, 'bez ankiety: sytość i jedzenie bez presji');
      } else if (state && state.ageGroup === 'teen') {
        addDietPersonalizationPriority(map, 'regularMeals', 86, 'bez ankiety: regularność u nastolatka');
        addDietPersonalizationPriority(map, 'vegetablesFruit', 82, 'bez ankiety: talerz i warzywa');
        addDietPersonalizationPriority(map, 'slowEatingSatiety', 74, 'bez ankiety: tempo jedzenia i sytość');
      } else {
        addDietPersonalizationPriority(map, 'plateMethod', 86, 'bez ankiety: prosty model posiłku');
        addDietPersonalizationPriority(map, 'regularMeals', 82, 'bez ankiety: regularność');
        addDietPersonalizationPriority(map, 'energyDensity', 76, 'bez ankiety: gęstość energetyczna');
      }
      return map;
    }
    if (hasDietPersonalizationAny(state, ['sweetDrinks', 'childSweetDrinks', 'schoolSnacks', 'alcohol'])) {
      addDietPersonalizationPriority(map, 'sweetDrinks', state.checked.alcohol && !hasDietPersonalizationAny(state, ['sweetDrinks', 'childSweetDrinks']) ? 96 : 110, 'płynne kalorie');
    }
    if (hasDietPersonalizationAny(state, ['irregularMeals', 'skippedBreakfast', 'longGaps', 'noSchoolMeal'])) {
      addDietPersonalizationPriority(map, 'regularMeals', 100, 'rytm posiłków');
    }
    if (hasDietPersonalizationAny(state, ['lowVegetablesFruit', 'childPickyVegetables'])) {
      addDietPersonalizationPriority(map, 'vegetablesFruit', 94, 'niska podaż warzyw i owoców');
    }
    if (hasDietPersonalizationAny(state, ['eveningSnacking'])) {
      addDietPersonalizationPriority(map, 'eveningSnacking', 88, 'wieczorne podjadanie');
    }
    if (hasDietPersonalizationAny(state, ['fastFood', 'saltySnacks', 'highFatAddons', 'sweets'])) {
      addDietPersonalizationPriority(map, 'energyDensity', 84, 'wysoka gęstość energetyczna');
    }
    if (hasDietPersonalizationAny(state, ['fastEating', 'screenEating', 'childScreenEating', 'poorSatietyRecognition'])) {
      addDietPersonalizationPriority(map, 'slowEatingSatiety', 80, 'tempo jedzenia i sytość');
    }
    if (hasDietPersonalizationAny(state, ['emotionalEating', 'foodReward'])) {
      addDietPersonalizationPriority(map, 'emotionalEating', 78, 'jedzenie emocjonalne lub nagroda');
    }
    if (hasDietPersonalizationAny(state, ['littleCookingTime', 'poorMealPlanning', 'eatingOutOften', 'needsSimpleMeals'])) {
      addDietPersonalizationPriority(map, 'simplePlanning', 68, 'organizacja posiłków');
    }
    if (hasDietPersonalizationAny(state, ['lowProtein'])) {
      addDietPersonalizationPriority(map, 'proteinAtMeals', 62, 'mało źródeł białka');
    }
    if (hasDietPersonalizationAny(state, ['lowWholeGrains'])) {
      addDietPersonalizationPriority(map, 'fiberWholeGrains', 58, 'mało produktów pełnoziarnistych');
    }
    if (!Object.keys(map).length) {
      addDietPersonalizationPriority(map, 'plateMethod', 70, 'cel bazowy');
      addDietPersonalizationPriority(map, 'regularMeals', 68, 'cel bazowy');
      addDietPersonalizationPriority(map, 'vegetablesFruit', 66, 'cel bazowy');
    }
    return map;
  }

  function selectTopDietGoals(priorityMap, maxGoals) {
    return Object.keys(priorityMap || {})
      .map(function(key) { return priorityMap[key]; })
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, Number.isFinite(maxGoals) ? maxGoals : DIET_PERSONALIZATION_MAX_GOALS);
  }

  function buildSmartGoal(goalKey, state) {
    const ageGroup = state.ageGroup;
    const isYoungChild = ageGroup === 'youngChild';
    const isSchoolChild = ageGroup === 'schoolChild';
    const isTeen = ageGroup === 'teen';
    const isAdult = ageGroup === 'adult';
    const child = isYoungChild || isSchoolChild;
    const base = {
      key: goalKey,
      title: 'Mały krok',
      goal: '',
      frequency: 'codziennie lub w większości dni tygodnia',
      duration: '2 tygodnie',
      measure: 'zaznacz wykonanie w kalendarzu lub notatniku',
      why: 'mała, powtarzalna zmiana jest łatwiejsza do utrzymania niż restrykcyjna dieta.'
    };
    switch (goalKey) {
      case 'waterDefault':
      case 'sweetDrinks':
        base.title = child ? 'Woda jako podstawowy napój' : 'Ograniczenie płynnych kalorii';
        base.goal = child
          ? 'Przez najbliższe 2 tygodnie podstawowym napojem w domu jest woda. Słodkie napoje nie powinny być dostępne na co dzień.'
          : (isTeen
            ? 'Przez 14 dni zamień słodzone napoje, soki lub energetyki na wodę minimum przez 5 dni w tygodniu.'
            : 'Przez 14 dni zamień słodzone napoje, soki, napoje energetyczne lub kaloryczne napoje alkoholowe na wodę albo niesłodzoną herbatę minimum przez 5 dni w tygodniu.');
        base.frequency = child ? 'minimum 5 dni w tygodniu' : 'minimum 5 dni w tygodniu';
        base.measure = 'zaznacz każdy dzień bez słodzonego napoju jako codziennego wyboru.';
        base.why = 'płynne kalorie słabo sycą i często są najłatwiejszym pierwszym obszarem do poprawy.';
        break;
      case 'regularMeals':
        base.title = child ? 'Przewidywalny rytm posiłków' : 'Regularność posiłków';
        base.goal = child
          ? 'Ustal przewidywalny rytm dnia: śniadanie, posiłek w przedszkolu/szkole, obiad i kolacja, bez ciągłego podjadania między posiłkami.'
          : (isTeen
            ? 'Zjedz śniadanie albo posiłek w szkole minimum 10 razy w ciągu 14 dni.'
            : 'Zjedz minimum 3 zaplanowane posiłki dziennie przez 10 z 14 dni.');
        base.frequency = isAdult ? '10 z 14 dni' : 'minimum 4–5 dni w tygodniu';
        base.measure = 'zaznacz dzień, w którym udało się uniknąć długiego głodzenia i późniejszego nadrabiania.';
        base.why = 'regularność zmniejsza ryzyko silnego głodu, przypadkowego podjadania i bardzo dużych porcji wieczorem.';
        break;
      case 'vegetablesFruit':
        base.title = child ? 'Warzywo jako codzienna ekspozycja' : 'Więcej warzyw i owoców';
        base.goal = child
          ? 'Dodaj małą porcję warzywa do obiadu lub kolacji minimum 5 razy w tygodniu. Porcja może być mała — ważna jest regularna ekspozycja bez presji.'
          : 'Dodaj warzywo lub owoc do minimum 2 posiłków dziennie. Docelowo dąż do co najmniej 400 g warzyw i owoców dziennie, z przewagą warzyw.';
        base.frequency = child ? 'minimum 5 razy w tygodniu' : 'codziennie';
        base.measure = child ? 'zaznacz każdy posiłek, przy którym pojawiło się warzywo.' : 'zaznacz dzień, w którym warzywa/owoce pojawiły się przy co najmniej 2 posiłkach.';
        base.why = 'warzywa i owoce zwiększają objętość posiłku, dostarczają błonnika i pomagają uzyskać sytość przy niższej gęstości energetycznej.';
        break;
      case 'plateMethod':
        base.title = 'Talerz zdrowego żywienia';
        base.goal = 'Przez 14 dni skomponuj jeden główny posiłek dziennie według zasady: ½ talerza warzywa/owoce z przewagą warzyw, ¼ źródło białka, ¼ produkt zbożowy lub ziemniaki, plus niewielki dodatek tłuszczu roślinnego.';
        base.frequency = 'jeden główny posiłek dziennie';
        base.measure = 'zaznacz każdy posiłek, w którym udało się zachować te proporcje choćby orientacyjnie.';
        base.why = 'model talerza porządkuje porcje bez konieczności ważenia każdego składnika.';
        break;
      case 'screenFreeMeal':
      case 'slowEatingSatiety':
        base.title = child ? 'Jeden spokojny posiłek bez ekranu' : 'Wolniejsze jedzenie i sytość';
        base.goal = child
          ? 'Wybierz jeden posiłek dziennie, który dziecko je bez telefonu, tabletu lub telewizora. Nie zachęcaj do „czyszczenia talerza”.'
          : 'Wybierz jeden posiłek dziennie bez telefonu, komputera lub telewizora. Jedz wolniej, najlepiej minimum 15 minut, i zatrzymaj się w połowie posiłku, żeby ocenić głód i sytość.';
        base.frequency = 'minimum 5 dni w tygodniu';
        base.measure = 'zaznacz każdy dzień z jednym spokojnym posiłkiem bez ekranu.';
        base.why = 'wolniejsze jedzenie ułatwia zauważenie sytości i zmniejsza ryzyko dokładania porcji z rozpędu.';
        break;
      case 'eveningSnacking':
        base.title = 'Ograniczenie wieczornego podjadania';
        base.goal = 'Zaplanuj prostą kolację z białkiem i warzywami, a przekąski wieczorne jedz tylko wtedy, gdy są wcześniej zaplanowane i podane na talerzu.';
        base.frequency = '10 z 14 wieczorów';
        base.measure = 'zaznacz wieczory bez przypadkowego podjadania przy ekranie lub „z opakowania”.';
        base.why = 'wieczorne podjadanie często wynika z długich przerw w jedzeniu, zmęczenia lub jedzenia przy ekranie, a nie z realnej potrzeby energetycznej.';
        break;
      case 'energyDensity':
        base.title = 'Mniejsza gęstość energetyczna posiłków';
        base.goal = 'W jednym głównym posiłku dziennie zwiększ objętość przez warzywa, zupę, strączki lub produkt pełnoziarnisty, a ogranicz smażenie, słodkie dodatki, majonezowe sosy i duże ilości tłuszczu.';
        base.frequency = 'jeden główny posiłek dziennie';
        base.measure = 'zaznacz posiłek, w którym udało się dodać objętość i zmniejszyć wysokokaloryczny dodatek.';
        base.why = 'posiłek o niższej gęstości energetycznej może sycić podobnie, ale dostarczać mniej kalorii.';
        break;
      case 'emotionalEating':
        base.title = child ? 'Jedzenie nie jako nagroda lub pocieszenie' : 'Głód fizjologiczny czy zachcianka';
        base.goal = child
          ? 'Przez 2 tygodnie nie używaj słodyczy jako głównej nagrody lub sposobu uspokajania. W zamian zaproponuj rozmowę, odpoczynek, zabawę, spacer albo inną formę wsparcia.'
          : 'Zanim sięgniesz po przekąskę poza planem, zadaj 3 pytania: czy zjadł(a)bym zwykły posiłek, kiedy był ostatni posiłek i czy czuję głód, czy raczej stres, zmęczenie albo nudę.';
        base.frequency = 'przy każdej sytuacji podjadania poza planem';
        base.measure = 'zapisz 3–5 sytuacji, w których udało się rozpoznać emocję lub realny głód przed jedzeniem.';
        base.why = 'rozpoznanie przyczyny podjadania pomaga dobrać właściwą reakcję zamiast kolejnego zakazu.';
        break;
      case 'simplePlanning':
        base.title = 'Plan minimum na trudne dni';
        base.goal = 'Przygotuj listę 3 prostych posiłków awaryjnych, które można zrobić szybko lub kupić bez dużej ilości smażonych dodatków i słodkich napojów.';
        base.frequency = 'lista gotowa w tym tygodniu, używana w razie potrzeby';
        base.measure = 'zapisz 3 propozycje i sprawdź po 2 tygodniach, ile razy zastąpiły przypadkowy fast food lub słodycze.';
        base.why = 'prosty plan awaryjny zmniejsza liczbę decyzji podejmowanych pod wpływem głodu i pośpiechu.';
        break;
      case 'proteinAtMeals':
        base.title = 'Źródło białka w głównych posiłkach';
        base.goal = 'Dodaj źródło białka do 2 głównych posiłków dziennie: jogurt/skyr/twaróg, jaja, ryby, chude mięso, tofu, strączki lub inne akceptowane produkty.';
        base.frequency = 'minimum 5 dni w tygodniu';
        base.measure = 'zaznacz dni, w których białko było obecne w co najmniej 2 posiłkach.';
        base.why = 'białko zwiększa sytość i pomaga utrzymać jakość diety podczas redukcji masy.';
        break;
      case 'fiberWholeGrains':
        base.title = 'Więcej błonnika z produktów pełnoziarnistych';
        base.goal = 'Wybierz jedną prostą zamianę dziennie: pieczywo graham/pełnoziarniste zamiast białego, płatki owsiane zamiast słodzonych płatków albo kaszę/pełnoziarnisty makaron zamiast oczyszczonego produktu.';
        base.frequency = 'minimum 5 dni w tygodniu';
        base.measure = 'zaznacz każdy dzień z jedną pełnoziarnistą zamianą.';
        base.why = 'błonnik wspiera sytość, rytm wypróżnień i jakość metaboliczną diety.';
        break;
      default:
        break;
    }
    return base;
  }

  function buildPlateRecommendationText(state) {
    if (dietPersonalizationIsChildGroup(state.ageGroup)) {
      return 'U dziecka nie trzeba od razu zmieniać całego talerza. Zacznij od stałego rytmu posiłków, wody jako podstawowego napoju i małych porcji warzyw podawanych regularnie bez presji.';
    }
    return 'Model głównego posiłku: ½ talerza warzywa i owoce z przewagą warzyw, ¼ talerza źródło białka, ¼ talerza produkt zbożowy lub ziemniaki, do tego niewielka ilość tłuszczu roślinnego.';
  }

  function buildProductSwaps(state) {
    const swaps = [];
    const add = function(from, to) {
      if (swaps.length < 5) swaps.push({ from, to });
    };
    if (hasDietPersonalizationAny(state, ['sweetDrinks', 'childSweetDrinks', 'schoolSnacks'])) {
      add('słodzony napój / sok', 'woda, woda z owocami lub herbata bez cukru');
    }
    if (hasDietPersonalizationAny(state, ['sweets'])) {
      add('słodzony jogurt lub baton', 'jogurt naturalny z owocami albo zaplanowana porcja przekąski');
    }
    if (hasDietPersonalizationAny(state, ['saltySnacks'])) {
      add('chipsy lub słone przekąski z opakowania', 'warzywa z jogurtowym dipem, hummus albo przekąska podana na talerzu');
    }
    if (hasDietPersonalizationAny(state, ['highFatAddons'])) {
      add('sos majonezowy / śmietanowy', 'sos jogurtowy, pomidorowy lub mniejsza porcja sosu');
    }
    if (hasDietPersonalizationAny(state, ['fastFood', 'eatingOutOften'])) {
      add('duży zestaw fast food + słodki napój', 'mniejsza porcja, więcej surówki i woda');
    }
    if (hasDietPersonalizationAny(state, ['lowWholeGrains'])) {
      add('białe pieczywo lub słodkie płatki', 'pieczywo graham/pełnoziarniste albo płatki owsiane');
    }
    if (hasDietPersonalizationAny(state, ['noDairy'])) {
      add('brak nabiału bez zamienników', 'napoje/jogurty roślinne fortyfikowane wapniem lub inne źródła wapnia po uzgodnieniu z dietetykiem');
    }
    if (hasDietPersonalizationAny(state, ['vegetarian'])) {
      add('posiłek bez wyraźnego źródła białka', 'strączki, tofu, jaja, nabiał lub inny akceptowany produkt białkowy');
    }
    if (!swaps.length) {
      add('smażenie w głębokim tłuszczu', 'pieczenie, duszenie, grillowanie lub gotowanie');
      add('obiad lub kolacja bez warzyw', 'dodaj konkretną małą porcję: kilka plasterków ogórka lub pomidora, 2–3 łyżki surówki albo warzywa gotowane');
      add('przypadkowa przekąska', 'zaplanowana przekąska podana na talerzu');
    }
    return swaps;
  }

  function buildDietMythBlock(state) {
    const signature = dietRecommendationsBuildMythSignature(state);
    const current = dietRecommendationsMythSelection || { signature: '', mythId: '' };
    if (!dietRecommendationsForceNewMyth && current.signature === signature && current.mythId) {
      const existing = dietRecommendationsFindMythById(current.mythId);
      if (existing) return existing;
    }
    const selected = dietRecommendationsSelectMyth(state, {
      excludeCurrentId: dietRecommendationsForceNewMyth && current.signature === signature ? current.mythId : '',
      excludeRecent: true
    });
    dietRecommendationsForceNewMyth = false;
    dietRecommendationsMythSelection = { signature, mythId: selected.id };
    dietRecommendationsRememberMythId(selected.id);
    return selected;
  }

  function buildDietMainGoal(state) {
    const hasWhrRisk = state.ageGroup === 'adult' && hasAdultDietWhrRisk();
    if (dietPersonalizationIsChildGroup(state.ageGroup)) {
      return state.strategy === 'stabilization'
        ? 'Poprawa codziennych nawyków i tempa przyrostu masy ciała, bez restrykcyjnej diety. W praktyce celem może być stabilizacja masy przy dalszym wzrastaniu.'
        : 'Poprawa środowiska żywieniowego, rytmu posiłków i codziennych wyborów dziecka bez zawstydzania i bez restrykcyjnej diety.';
    }
    if (state.ageGroup === 'teen') {
      return 'Poprawa regularności, jakości posiłków i kontroli sytości bez podejścia „wszystko albo nic”.';
    }
    if (hasWhrRisk) {
      return 'Stopniowa redukcja masy ciała i/lub obwodu talii przez małe, mierzalne zmiany w sposobie jedzenia.';
    }
    return 'Stopniowa poprawa masy ciała, sytości i jakości diety przez 2–3 małe kroki, które można utrzymać w codziennym życiu.';
  }

  function buildDietNoShameReminder(state) {
    if (dietPersonalizationIsChildGroup(state.ageGroup)) {
      return 'Nie komentuj wyglądu dziecka i nie porównuj go z innymi. Zmiana powinna dotyczyć całej rodziny i środowiska domowego, nie tylko dziecka.';
    }
    if (state.ageGroup === 'teen') {
      return 'Nie chodzi o idealną dietę. Lepiej ustalić rozsądne porcje i częstotliwość niż wprowadzać zasadę „nigdy więcej”.';
    }
    if (state.sex === 'F') {
      return 'Oceniaj trend masy ciała z kilku tygodni, nie pojedynczy pomiar. Masa może okresowo rosnąć z powodu zatrzymania wody, soli, cyklu miesiączkowego lub intensywnego wysiłku.';
    }
    return 'Nie trzeba zmieniać wszystkiego naraz. Największe znaczenie ma powtarzalność kilku dobrych wyborów w większości dni tygodnia.';
  }

  function buildPersonalizedDietPlan(state) {
    const priorities = scoreDietPriorities(state);
    const selected = selectTopDietGoals(priorities, DIET_PERSONALIZATION_MAX_GOALS);
    const goals = selected.map(function(item) { return buildSmartGoal(item.key, state); });
    return {
      state,
      sourceLabel: state.surveyCompleted ? 'Na podstawie danych pacjenta i ankiety' : 'Na podstawie danych pacjenta; bez dodatkowej ankiety wybrano cele bazowe',
      ageLabel: getDietPersonalizationAgeLabel(state.ageGroup),
      mainGoal: buildDietMainGoal(state),
      goals,
      plateText: buildPlateRecommendationText(state),
      swaps: buildProductSwaps(state),
      myth: buildDietMythBlock(state),
      reminder: buildDietNoShameReminder(state)
    };
  }

  function buildPersonalizedDietPlanText(plan, baseResult) {
    const out = [];
    out.push('Spersonalizowane zalecenia dietetyczne');
    out.push(plan.sourceLabel + ' — grupa: ' + plan.ageLabel + '.');
    out.push('Cel główny: ' + plan.mainGoal);
    out.push('');
    out.push('Twoje małe kroki na najbliższe 2 tygodnie:');
    plan.goals.forEach(function(goal, idx) {
      out.push((idx + 1) + '. ' + goal.title);
      out.push('   Cel: ' + goal.goal);
      out.push('   Jak często: ' + goal.frequency + '.');
      out.push('   Jak mierzyć: ' + goal.measure);
      out.push('   Dlaczego: ' + goal.why);
    });
    out.push('');
    out.push('Jak komponować posiłki: ' + plan.plateText);
    if (plan.swaps.length) {
      out.push('');
      out.push('Praktyczne zamiany:');
      plan.swaps.forEach(function(swap) {
        out.push('- ' + swap.from + ' → ' + swap.to);
      });
    }
    out.push('');
    out.push('Mit / popularne przekonanie: ' + plan.myth.myth);
    out.push('Fakt: ' + plan.myth.fact);
    if (plan.myth.practical) out.push('Co zrobić w praktyce: ' + plan.myth.practical);
    out.push('');
    out.push('Ważne: ' + plan.reminder);
    if (baseResult && baseResult.textOutput) {
      out.push('');
      out.push('Dodatkowe obliczenia i zalecenia energetyczne:');
      out.push(baseResult.textOutput);
    }
    return out.join('\n').replace(/[\u00A0\u202F]/g, ' ').trim();
  }

  function buildPersonalizedDietPlanHtml(plan, baseResult) {
    const goalsHtml = plan.goals.map(function(goal, idx) {
      return `
        <article class="diet-smart-goal">
          <div class="diet-smart-goal-number">${idx + 1}</div>
          <div class="diet-smart-goal-body">
            <h4>${dietRecommendationsEscapeHtml(goal.title)}</h4>
            <p><strong>Cel:</strong> ${dietRecommendationsEscapeHtml(goal.goal)}</p>
            <p><strong>Jak często:</strong> ${dietRecommendationsEscapeHtml(goal.frequency)}.</p>
            <p><strong>Jak mierzyć:</strong> ${dietRecommendationsEscapeHtml(goal.measure)}</p>
            <p><strong>Dlaczego:</strong> ${dietRecommendationsEscapeHtml(goal.why)}</p>
          </div>
        </article>
      `;
    }).join('');
    const swapsHtml = plan.swaps.map(function(swap) {
      return `<li><span>${dietRecommendationsEscapeHtml(swap.from)}</span><strong>→</strong><span>${dietRecommendationsEscapeHtml(swap.to)}</span></li>`;
    }).join('');
    const baseHtml = baseResult && baseResult.htmlOutput
      ? `<details class="diet-calculation-details"><summary>Dodatkowe obliczenia i zalecenia energetyczne</summary><div class="diet-calculation-details-body">${baseResult.htmlOutput}</div></details>`
      : '';
    const surveyBadge = plan.state.surveyCompleted
      ? '<span class="diet-personalized-badge diet-personalized-badge--active">ankieta uwzględniona</span>'
      : '<span class="diet-personalized-badge">cele bazowe</span>';
    return `
      <div class="diet-personalized-output">
        <div class="diet-personalized-summary">
          <div>
            <div class="diet-personalized-kicker">${dietRecommendationsEscapeHtml(plan.sourceLabel)}</div>
            <h3>Priorytety na najbliższe 2 tygodnie</h3>
            <p><strong>Grupa:</strong> ${dietRecommendationsEscapeHtml(plan.ageLabel)}.</p>
            <p><strong>Cel główny:</strong> ${dietRecommendationsEscapeHtml(plan.mainGoal)}</p>
          </div>
          ${surveyBadge}
        </div>
        <div class="diet-smart-goals">${goalsHtml}</div>
        <div class="diet-guidance-grid">
          <section class="diet-guidance-box">
            <h4>Jak komponować posiłek</h4>
            <p>${dietRecommendationsEscapeHtml(plan.plateText)}</p>
          </section>
          <section class="diet-guidance-box">
            <h4>Praktyczne zamiany</h4>
            <ul class="diet-swaps-list">${swapsHtml}</ul>
          </section>
          <section class="diet-guidance-box diet-guidance-box--wide">
            <h4>Nie chodzi o perfekcję</h4>
            <p>${dietRecommendationsEscapeHtml(plan.reminder)}</p>
          </section>
          <section class="diet-guidance-box diet-guidance-box--wide diet-myth-box">
            <div class="diet-myth-box-head">
              <h4>Warto wiedzieć: mit i fakt</h4>
              <button type="button" class="diet-myth-next-btn" data-diet-myth-next>Pokaż inne przekonanie</button>
            </div>
            <p><strong>Mit / popularne przekonanie:</strong> ${dietRecommendationsEscapeHtml(plan.myth.myth)}</p>
            <p><strong>Fakt:</strong> ${dietRecommendationsEscapeHtml(plan.myth.fact)}</p>
            ${plan.myth.practical ? `<p><strong>Co zrobić w praktyce:</strong> ${dietRecommendationsEscapeHtml(plan.myth.practical)}</p>` : ''}
          </section>
        </div>
        ${baseHtml}
      </div>
    `;
  }


  function buildDietBaseRecommendationResultForReport() {
    syncDietRecommendationControlsForAge();
    const age = getAgeDecimalInternal();
    if (age >= getDietAdultStartAge()) {
      return (typeof generateDietRecommendations === 'function') ? generateDietRecommendations() : null;
    }

    const reduceToggleEl = document.getElementById('reduceToggle');
    const stabilizationToggleEl = document.getElementById('stabilizationToggle');
    const strategy = (stabilizationToggleEl && stabilizationToggleEl.checked && !(reduceToggleEl && reduceToggleEl.checked))
      ? 'stabilization'
      : 'reduction';

    if (strategy === 'stabilization' && typeof generateDietRecommendationsStabilization === 'function') {
      return generateDietRecommendationsStabilization();
    }
    return (typeof generateDietRecommendations === 'function') ? generateDietRecommendations() : null;
  }

  function dietRecommendationsEnsurePdfButton(content) {
    const container = content || document.getElementById('dietRecommendationsContent');
    if (!container) return null;
    const btn = document.getElementById('dietRecommendationsPdfBtn');
    if (btn && btn.parentNode) {
      btn.parentNode.removeChild(btn);
    }
    return null;
  }

  function dietRecommendationsNormalizePdfMode(mode) {
    const raw = String(mode || '').trim().toLowerCase();
    if (raw === 'personalized' || raw === 'personalizacja' || raw === 'smart') return 'personalized';
    if (raw === 'classic' || raw === 'legacy' || raw === 'old' || raw === 'dotychczasowe') return 'classic';
    return 'full';
  }

  function dietRecommendationsPdfModeLabel(mode) {
    const normalized = dietRecommendationsNormalizePdfMode(mode);
    if (normalized === 'personalized') return 'Plan zmiany nawyków i cele SMART';
    if (normalized === 'classic') return 'Raport energetyczny i zalecenia podstawowe';
    return 'Pełny raport zaleceń';
  }

  function dietRecommendationsFormatPdfNumber(value, decimals) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '';
    const digits = Number.isFinite(decimals) ? Math.max(0, decimals) : 1;
    return num.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function dietRecommendationsGetPdfAgeLabel(ageYears) {
    try {
      if (typeof patientReportFormatAge === 'function') return patientReportFormatAge(ageYears);
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 8711 });
    }
  }
    const age = Number(ageYears);
    if (!Number.isFinite(age)) return '';
    return age.toLocaleString('pl-PL', { maximumFractionDigits: age < 3 ? 1 : 0 }) + ' lat';
  }

  function dietRecommendationsGetPdfSexLabel(sex, ageYears) {
    try {
      if (typeof patientReportGetSexLabel === 'function') return patientReportGetSexLabel(sex, ageYears);
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 8720 });
    }
  }
    return sex === 'F' ? 'żeńska' : 'męska';
  }

  function dietRecommendationsSanitizeFilename(value) {
    try {
      if (typeof patientReportSanitizeFilename === 'function') return patientReportSanitizeFilename(value);
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 8727 });
    }
  }
    return String(value || 'pacjent')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'pacjent';
  }

  function dietRecommendationsParseClassicTextForPdf(text) {
    const lines = String(text || '')
      .replace(/[\u00A0\u202F]/g, ' ')
      .split(/\r?\n+/)
      .map(function(line) { return line.trim(); })
      .filter(Boolean);
    const intro = [];
    const items = [];
    lines.forEach(function(line) {
      const match = line.match(/^\s*(\d+)[\.)]\s*(.+)$/);
      if (match) {
        items.push({ index: match[1], text: match[2].trim() });
      } else if (items.length) {
        items[items.length - 1].text = (items[items.length - 1].text + ' ' + line).replace(/\s+/g, ' ').trim();
      } else {
        intro.push(line);
      }
    });
    if (!items.length && lines.length) {
      return {
        intro: [],
        items: lines.map(function(line, idx) { return { index: String(idx + 1), text: line }; })
      };
    }
    return { intro, items };
  }

  function dietRecommendationsBuildPdfPatientMeta() {
    const name = (document.getElementById('name')?.value || document.getElementById('advName')?.value || '').trim();
    const sex = document.getElementById('sex')?.value || 'M';
    const ageYears = getAgeDecimalInternal();
    const weightKg = parseFloat(document.getElementById('weight')?.value);
    const heightCm = parseFloat(document.getElementById('height')?.value);
    const bmi = (Number.isFinite(weightKg) && weightKg > 0 && Number.isFinite(heightCm) && heightCm > 0)
      ? weightKg / Math.pow(heightCm / 100, 2)
      : NaN;
    let generatedLabel = '';
    try {
      generatedLabel = new Intl.DateTimeFormat('pl-PL', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      }).format(new Date());
    } catch (_) {
      generatedLabel = String(new Date());
    }
    return {
      name,
      sex,
      sexLabel: dietRecommendationsGetPdfSexLabel(sex, ageYears),
      ageYears,
      ageLabel: dietRecommendationsGetPdfAgeLabel(ageYears),
      weightLabel: Number.isFinite(weightKg) && weightKg > 0 ? dietRecommendationsFormatPdfNumber(weightKg, 1) + ' kg' : '',
      heightLabel: Number.isFinite(heightCm) && heightCm > 0 ? dietRecommendationsFormatPdfNumber(heightCm, 1) + ' cm' : '',
      bmiLabel: Number.isFinite(bmi) ? dietRecommendationsFormatPdfNumber(bmi, 1) + ' kg/m²' : '',
      generatedLabel
    };
  }

  function dietRecommendationsBuildPdfModel(mode) {
    const normalizedMode = dietRecommendationsNormalizePdfMode(mode);
    syncDietRecommendationControlsForAge();
    ensureDietPersonalizationSurveyUi(document.getElementById('dietRecommendationsContent'));

    const state = collectDietPersonalizationState();
    const includePersonalized = normalizedMode !== 'classic';
    const includeClassic = normalizedMode !== 'personalized';
    const baseResult = includeClassic ? buildDietBaseRecommendationResultForReport() : null;
    const plan = includePersonalized ? buildPersonalizedDietPlan(state) : null;
    const parsedClassic = baseResult && baseResult.textOutput ? dietRecommendationsParseClassicTextForPdf(baseResult.textOutput) : { intro: [], items: [] };

    if (!plan && (!baseResult || !baseResult.textOutput)) {
      throw new Error('Brak zaleceń dietetycznych do wygenerowania raportu PDF.');
    }

    const patient = dietRecommendationsBuildPdfPatientMeta();
    const filenameBase = dietRecommendationsSanitizeFilename(patient.name || 'pacjent');
    const surveyCount = state && Array.isArray(state.checkedKeys) ? state.checkedKeys.length : 0;
    const hasWhrRisk = state.ageGroup === 'adult' && hasAdultDietWhrRisk();
    return {
      mode: normalizedMode,
      modeLabel: dietRecommendationsPdfModeLabel(normalizedMode),
      title: 'Raport zaleceń dietetycznych',
      subtitle: normalizedMode === 'classic'
        ? 'Raport energetyczny i zalecenia podstawowe'
        : (normalizedMode === 'full'
          ? ''
          : 'Plan po wizycie oparty na metodzie małych kroków i konkretnych celach'),
      patient,
      filenameBase,
      state,
      plan,
      baseResult,
      parsedClassic,
      includePersonalized,
      includeClassic,
      surveyCount,
      hasWhrRisk,
      sourceLabel: plan ? plan.sourceLabel : 'Na podstawie obliczeń energetycznych aplikacji',
      ageLabel: plan ? plan.ageLabel : getDietPersonalizationAgeLabel(state.ageGroup)
    };
  }

  function dietRecommendationsPdfMetaChipsHtml(model) {
    const chips = [];
    const patient = model.patient || {};
    if (patient.name) chips.push(['Pacjent', patient.name]);
    if (patient.ageLabel) chips.push(['Wiek', patient.ageLabel]);
    if (patient.sexLabel) chips.push(['Płeć', patient.sexLabel]);
    if (patient.weightLabel) chips.push(['Masa', patient.weightLabel]);
    if (patient.heightLabel) chips.push(['Wzrost', patient.heightLabel]);
    if (patient.bmiLabel) chips.push(['BMI', patient.bmiLabel]);
    return chips.map(function(chip) {
      return `<span class="diet-pdf-chip"><span>${dietRecommendationsEscapeHtml(chip[0])}</span><strong>${dietRecommendationsEscapeHtml(chip[1])}</strong></span>`;
    }).join('');
  }

  function dietRecommendationsPdfGoalsHtml(plan) {
    if (!plan || !Array.isArray(plan.goals) || !plan.goals.length) return '';
    return plan.goals.map(function(goal, idx) {
      return `
        <article class="diet-pdf-goal-card">
          <div class="diet-pdf-goal-number">${idx + 1}</div>
          <div class="diet-pdf-goal-copy">
            <h3>${dietRecommendationsEscapeHtml(goal.title)}</h3>
            <div class="diet-pdf-smart-grid">
              <div><span>Cel</span><p>${dietRecommendationsEscapeHtml(goal.goal)}</p></div>
              <div><span>Jak często</span><p>${dietRecommendationsEscapeHtml(goal.frequency)}</p></div>
              <div><span>Jak mierzyć</span><p>${dietRecommendationsEscapeHtml(goal.measure)}</p></div>
              <div><span>Dlaczego</span><p>${dietRecommendationsEscapeHtml(goal.why)}</p></div>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function dietRecommendationsNormalizeSwapText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ąćęłńóśźż\s]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function dietRecommendationsSwapLooksSimilar(existing, candidate) {
    const a = dietRecommendationsNormalizeSwapText((existing && existing.from ? existing.from : '') + ' ' + (existing && existing.to ? existing.to : ''));
    const b = dietRecommendationsNormalizeSwapText((candidate && candidate.from ? candidate.from : '') + ' ' + (candidate && candidate.to ? candidate.to : ''));
    if (!a || !b) return false;
    const groups = [
      ['sos', 'majonez', 'smietan', 'jogurt', 'pomidor'],
      ['smazen', 'smazon', 'glebok', 'grill', 'piec', 'para'],
      ['warzyw', 'fasol', 'groch', 'soczewic', 'straczk'],
      ['chips', 'przekask', 'hummus', 'dip'],
      ['deser', 'owoc', 'jogurt', 'smietan'],
      ['mlecz', 'nabial', 'cukr', 'tluszcz'],
      ['fast food', 'surow', 'surowk', 'wynos']
    ];
    return groups.some(function(words) {
      let scoreA = 0;
      let scoreB = 0;
      words.forEach(function(word) {
        if (a.indexOf(word) !== -1) scoreA += 1;
        if (b.indexOf(word) !== -1) scoreB += 1;
      });
      return scoreA >= 2 && scoreB >= 2;
    });
  }

  function dietRecommendationsPdfSupplementalSwaps(state) {
    const child = state && dietPersonalizationIsChildGroup(state.ageGroup);
    return [
      {
        from: 'sosy kremowe, serowe lub ciężkie sosy śmietanowe',
        to: 'sos pomidorowy albo jogurtowy; w zupach częściej wybieraj bazę warzywną'
      },
      {
        from: 'potrawy smażone lub panierowane',
        to: 'pieczenie, duszenie, gotowanie na parze albo grillowanie oraz dodatkowa porcja warzyw'
      },
      {
        from: child ? 'danie bez warzyw albo tylko symboliczna ilość warzyw' : 'duża ilość mięsa w jednym daniu',
        to: child ? 'dodaj konkretną małą porcję: kilka plasterków ogórka lub pomidora, 2–3 łyżki surówki albo warzywa gotowane; bez presji na zjedzenie wszystkiego' : 'część porcji zastąp fasolą, grochem, soczewicą lub dodatkowymi warzywami'
      },
      {
        from: 'deser ze śmietaną lub ciężkim kremem',
        to: 'owoce z jogurtem naturalnym albo mniejsza, zaplanowana porcja deseru'
      },
      {
        from: 'pełnotłusty lub dosładzany produkt mleczny',
        to: 'jogurt naturalny, kefir, maślanka lub inny produkt bez dodatku cukru'
      },
      {
        from: 'chipsy z tłustym dipem',
        to: 'pokrojone warzywa z hummusem albo lekkim dipem jogurtowym'
      }
    ];
  }

  function dietRecommendationsAddUniqueSwap(target, candidate, maxItems) {
    if (!candidate || !candidate.from || !candidate.to || target.length >= maxItems) return;
    const duplicate = target.some(function(item) {
      return dietRecommendationsSwapLooksSimilar(item, candidate)
        || (dietRecommendationsNormalizeSwapText(item.from) === dietRecommendationsNormalizeSwapText(candidate.from)
          && dietRecommendationsNormalizeSwapText(item.to) === dietRecommendationsNormalizeSwapText(candidate.to));
    });
    if (!duplicate) target.push(candidate);
  }

  function dietRecommendationsPdfExpandedSwaps(plan, state, maxItems) {
    const limit = Number.isFinite(maxItems) ? Math.max(1, maxItems) : 6;
    const original = Array.isArray(plan && plan.swaps) ? plan.swaps : [];
    const expanded = [];
    original.slice(0, 3).forEach(function(swap) {
      dietRecommendationsAddUniqueSwap(expanded, swap, limit);
    });
    dietRecommendationsPdfSupplementalSwaps(state).forEach(function(swap) {
      dietRecommendationsAddUniqueSwap(expanded, swap, limit);
    });
    original.slice(3).forEach(function(swap) {
      dietRecommendationsAddUniqueSwap(expanded, swap, limit);
    });
    return expanded;
  }

  function dietRecommendationsPdfSwapsHtml(swaps) {
    const list = Array.isArray(swaps) ? swaps : [];
    if (!list.length) return '<div class="diet-pdf-empty">Brak dodatkowych zamian dla aktualnej ankiety.</div>';
    return `
      <div class="diet-pdf-swaps-table">
        <div class="diet-pdf-swaps-head"><span>Zamiast</span><span>Wybierz częściej</span></div>
        ${list.map(function(swap) {
          return `<div class="diet-pdf-swap-row"><span>${dietRecommendationsEscapeHtml(swap.from)}</span><span>${dietRecommendationsEscapeHtml(swap.to)}</span></div>`;
        }).join('')}
      </div>`;
  }

  function dietRecommendationsPdfClassicHtml(parsedClassic) {
    const parsed = parsedClassic || { intro: [], items: [] };
    const introHtml = (parsed.intro || []).map(function(text) {
      return `<p class="diet-pdf-classic-intro">${dietRecommendationsEscapeHtml(text)}</p>`;
    }).join('');
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    if (!items.length) return introHtml || '<div class="diet-pdf-empty">Brak zaleceń energetycznych do pokazania.</div>';
    return `
      ${introHtml}
      <ol class="diet-pdf-classic-list">
        ${items.map(function(item) {
          return `<li><span>${dietRecommendationsEscapeHtml(item.text)}</span></li>`;
        }).join('')}
      </ol>`;
  }

  function dietRecommendationsPdfTrackerHtml() {
    const boxes = Array.from({ length: 14 }).map(function(_, idx) {
      return `<span>${idx + 1}</span>`;
    }).join('');
    return `<div class="diet-pdf-tracker-days">${boxes}</div>`;
  }

  function dietRecommendationsPdfPageHtml(model, bodyHtml, className) {
    const subtitleHtml = model.subtitle
      ? `<p>${dietRecommendationsEscapeHtml(model.subtitle)}</p>`
      : '';
    return `
      <section class="diet-pdf-page ${className || ''}">
        <header class="diet-pdf-header">
          <div class="diet-pdf-header-title">
            <div class="diet-pdf-brand">wagaiwzrost.pl</div>
            <h1>${dietRecommendationsEscapeHtml(model.title)}</h1>
            ${subtitleHtml}
          </div>
          <div class="diet-pdf-date">${dietRecommendationsEscapeHtml(model.patient.generatedLabel || '')}</div>
        </header>
        ${bodyHtml}
        <footer class="diet-pdf-footer">
          <div class="diet-pdf-footer-note">
            <span class="diet-pdf-footer-dot" aria-hidden="true"></span>
            <span>Raport edukacyjny. Zalecenia uzupełniają konsultację i nie zastępują indywidualnej opieki medycznej lub dietetycznej.</span>
          </div>
          <div class="diet-pdf-footer-brand" aria-label="wagaiwzrost.pl">wagaiwzrost.pl</div>
        </footer>
      </section>`;
  }


  function dietRecommendationsClassifyClassicPdfText(text) {
    const t = String(text || '').toLowerCase();
    if (/kcal|kalor|deficyt|utrata|tydzień|tydzien|dieta dostarcza|zapotrzeb/.test(t)) return 'energy';
    if (/aktywn|ruch|spacer|rower|biegan|pływ|plyw|gry zespoł|gry zespol|telewiz|komputer|telefon|60 minut|wysił|wysil/.test(t)) return 'activity';
    if (/posił|posilk|warzyw|owoc|pełnoziarn|pelnoziarn|pieczyw|kasz|słodycz|slodycz|fast|napoj|napój|wod[ayę]|mięso|mieso|ryb|sos|ser|makaron|chude|gazowan/.test(t)) return 'nutrition';
    if (/waga|mas[ay]|bmi|norm|wzrost|roś|rosn|wyroś|wyros|średni|sredni|docelow|granicy/.test(t)) return 'weight';
    return 'other';
  }

  function dietRecommendationsGetIntegratedClassicSections(parsedClassic) {
    const defs = {
      weight: {
        key: 'weight',
        label: 'Cel i strategia masy ciała',
        kicker: 'ramy bezpieczeństwa',
        empty: 'Cel masy ciała powinien być interpretowany razem z wiekiem, wzrostem i tempem wzrastania.'
      },
      energy: {
        key: 'energy',
        label: 'Energia i tempo zmian',
        kicker: 'obliczenia',
        empty: 'Energia i ewentualny deficyt powinny wspierać bezpieczne, stopniowe zmiany, a nie skrajne restrykcje.'
      },
      nutrition: {
        key: 'nutrition',
        label: 'Posiłki i wybory żywieniowe',
        kicker: 'codzienna praktyka',
        empty: 'Najważniejsze są regularne posiłki, warzywa, woda i ograniczenie produktów o wysokiej gęstości energetycznej.'
      },
      activity: {
        key: 'activity',
        label: 'Aktywność i czas siedzący',
        kicker: 'ruch',
        empty: 'Ruch powinien być regularny, dopasowany do możliwości i możliwie przyjemny.'
      },
      other: {
        key: 'other',
        label: 'Dodatkowe uwagi',
        kicker: 'kontekst',
        empty: ''
      }
    };
    const sections = {};
    Object.keys(defs).forEach(function(key) {
      sections[key] = Object.assign({}, defs[key], { items: [] });
    });
    const parsed = parsedClassic || { intro: [], items: [] };
    (Array.isArray(parsed.intro) ? parsed.intro : []).forEach(function(text) {
      if (String(text || '').trim()) sections.other.items.push(String(text).trim());
    });
    (Array.isArray(parsed.items) ? parsed.items : []).forEach(function(item) {
      const text = String(item && item.text ? item.text : '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const key = dietRecommendationsClassifyClassicPdfText(text);
      sections[key].items.push(text);
    });
    return sections;
  }

  function dietRecommendationsPdfClampText(text, maxLength) {
    const value = String(text || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    // W raporcie PDF nie skracamy zaleceń wielokropkiem, bo pacjent musi widzieć pełną treść zaleceń.
    // Parametr zostaje tylko dla zgodności z wcześniejszymi wywołaniami.
    return value;
  }

  function dietRecommendationsPdfIntegratedListHtml(section, options) {
    const opts = options || {};
    const items = section && Array.isArray(section.items) ? section.items : [];
    const maxItems = Number.isFinite(opts.maxItems) ? Math.max(1, opts.maxItems) : items.length;
    const maxLength = Number.isFinite(opts.maxLength) ? opts.maxLength : 420;
    if (!items.length) {
      return section && section.empty
        ? `<p class="diet-pdf-integrated-empty">${dietRecommendationsEscapeHtml(section.empty)}</p>`
        : '<p class="diet-pdf-integrated-empty">Brak dodatkowych informacji w tej części raportu.</p>';
    }
    return `<ul class="diet-pdf-integrated-list">
      ${items.slice(0, maxItems).map(function(text) {
        return `<li>${dietRecommendationsEscapeHtml(dietRecommendationsPdfClampText(text, maxLength))}</li>`;
      }).join('')}
    </ul>`;
  }

  function dietRecommendationsPdfIntegratedSectionCardHtml(section, options) {
    const opts = options || {};
    const wideClass = opts.wide ? ' diet-pdf-integrated-card--wide' : '';
    const compactClass = opts.compact ? ' diet-pdf-integrated-card--compact' : '';
    return `
      <article class="diet-pdf-integrated-card${wideClass}${compactClass}">
        <div class="diet-pdf-card-kicker">${dietRecommendationsEscapeHtml(section.kicker || '')}</div>
        <h3>${dietRecommendationsEscapeHtml(section.label || '')}</h3>
        ${dietRecommendationsPdfIntegratedListHtml(section, opts)}
      </article>`;
  }

  function dietRecommendationsPdfIntegratedGoalContext(goal, model) {
    const key = goal && goal.key ? goal.key : '';
    const sections = model.integratedClassicSections || dietRecommendationsGetIntegratedClassicSections(model.parsedClassic);
    if (key === 'regularMeals') {
      return 'Ten krok przekłada klasyczne zalecenie regularnych posiłków na mierzalne zadanie, które ma ograniczyć długie przerwy, silny głód i nadrabianie jedzenia później.';
    }
    if (key === 'vegetablesFruit' || key === 'plateMethod' || key === 'fiberWholeGrains' || key === 'proteinAtMeals') {
      return 'Ten krok jest praktyczną wersją zaleceń o większym udziale warzyw, produktów pełnoziarnistych i źródeł białka w codziennych posiłkach.';
    }
    if (key === 'sweetDrinks' || key === 'waterDefault') {
      return 'Ten krok wspiera obliczony plan energetyczny, bo ogranicza kalorie, które słabo sycą i łatwo umykają w codziennym jadłospisie.';
    }
    if (key === 'energyDensity' || key === 'eveningSnacking' || key === 'simplePlanning') {
      return 'Ten krok łączy obliczenia energii z praktyką: zmniejsza gęstość energetyczną posiłków bez opierania planu na głodzie.';
    }
    if (key === 'slowEatingSatiety' || key === 'screenFreeMeal' || key === 'emotionalEating') {
      return 'Ten krok uzupełnia zalecenia energetyczne o kontrolę sytości, tempo jedzenia i sytuacje, w których najłatwiej jeść automatycznie.';
    }
    if (sections.energy && sections.energy.items && sections.energy.items.length) {
      return 'Ten krok pomaga wprowadzić obliczony plan energetyczny w codzienny, mierzalny sposób.';
    }
    return 'Ten krok jest praktycznym wdrożeniem strategii wyliczonej przez aplikację.';
  }

  function dietRecommendationsPdfShortIntegratedGoalContext(goal, model) {
    const key = goal && goal.key ? goal.key : '';
    if (key === 'regularMeals') return 'Łączy plan z codziennym rytmem jedzenia i ogranicza późniejsze nadrabianie.';
    if (key === 'vegetablesFruit' || key === 'plateMethod') return 'Przekłada zalecenia żywieniowe na prostą zmianę w każdym posiłku.';
    if (key === 'fiberWholeGrains' || key === 'proteinAtMeals') return 'Wspiera sytość oraz jakość posiłków przy założonych ramach energii.';
    if (key === 'sweetDrinks' || key === 'waterDefault') return 'Ogranicza płynne kalorie, które zwykle słabo sycą.';
    if (key === 'energyDensity' || key === 'eveningSnacking' || key === 'simplePlanning') return 'Zmniejsza gęstość energetyczną bez opierania planu na głodzie.';
    if (key === 'slowEatingSatiety' || key === 'screenFreeMeal' || key === 'emotionalEating') return 'Ułatwia rozpoznanie sytości i ogranicza jedzenie automatyczne.';
    return 'Pomaga przełożyć obliczenia na mierzalne zachowanie w najbliższych 14 dniach.';
  }

  function dietRecommendationsPdfGoalsIntegratedHtml(plan, model) {
    if (!plan || !Array.isArray(plan.goals) || !plan.goals.length) return '';
    return plan.goals.slice(0, 3).map(function(goal, idx) {
      const context = dietRecommendationsPdfShortIntegratedGoalContext(goal, model);
      return `
        <article class="diet-pdf-goal-card diet-pdf-goal-card-integrated diet-pdf-goal-card-compact">
          <div class="diet-pdf-goal-number">${idx + 1}</div>
          <div class="diet-pdf-goal-copy">
            <h3>${dietRecommendationsEscapeHtml(goal.title)}</h3>
            <p class="diet-pdf-goal-main"><strong>Cel:</strong> ${dietRecommendationsEscapeHtml(goal.goal)}</p>
            <div class="diet-pdf-goal-mini-grid">
              <div><span>Jak często</span><p>${dietRecommendationsEscapeHtml(goal.frequency)}</p></div>
              <div><span>Jak mierzyć</span><p>${dietRecommendationsEscapeHtml(goal.measure)}</p></div>
            </div>
            <p class="diet-pdf-goal-why"><strong>Dlaczego:</strong> ${dietRecommendationsEscapeHtml(goal.why)} <em>${dietRecommendationsEscapeHtml(context)}</em></p>
          </div>
        </article>`;
    }).join('');
  }

  function dietRecommendationsPdfEightyTwentyHtml(plan, state) {
    const isChild = state && dietPersonalizationIsChildGroup(state.ageGroup);
    const isTeen = state && state.ageGroup === 'teen';
    const contextText = isChild
      ? 'U dzieci zasada 80/20 dotyczy głównie środowiska domowego: większość wyborów rodziny wspiera zdrowe nawyki, ale bez zakazów, zawstydzania i komentowania wyglądu dziecka.'
      : (isTeen
        ? 'U nastolatków ta zasada pomaga odejść od myślenia „wszystko albo nic”: mniej udany posiłek nie kasuje planu, tylko jest sygnałem, żeby wrócić do kolejnego małego kroku.'
        : 'U dorosłych taka elastyczność ułatwia utrzymanie planu w pracy, w weekendy, w podróży i podczas spotkań rodzinnych, bez poczucia, że trzeba zaczynać od nowa.');
    const lead = 'Reguła 80/20 oznacza, że plan ma być powtarzalny, ale nie musi być perfekcyjny. Większość wyborów wspiera cel, a część zostaje na normalne sytuacje: wyjście, urodziny, weekend lub ulubiony produkt.';
    const bullets = [
      'Około 80% wyborów to codzienna baza: regularne posiłki, woda, warzywa, źródło białka, produkty mniej przetworzone i porcje dopasowane do planu.',
      'Około 20% to miejsce na elastyczność: ulubiony produkt, posiłek poza domem albo okazjonalny deser mogą się pojawić, najlepiej jako zaplanowana porcja.',
      'Elastyczność nie oznacza jedzenia bez kontroli i nie wymaga karania się po potknięciu. Po mniej udanym posiłku wróć do następnego zwykłego posiłku.',
      contextText
    ];
    return `
      <div class="diet-pdf-eighty-split" aria-hidden="true">
        <div><strong>80%</strong><span>codzienna baza planu</span></div>
        <div><strong>20%</strong><span>zaplanowana elastyczność</span></div>
      </div>
      <p class="diet-pdf-eighty-lead">${dietRecommendationsEscapeHtml(lead)}</p>
      <ul class="diet-pdf-eighty-list">
        ${bullets.map(function(text) { return `<li>${dietRecommendationsEscapeHtml(text)}</li>`; }).join('')}
      </ul>`;
  }

  function dietRecommendationsPdfMythCardHtml(plan, extraClass) {
    const myth = plan && plan.myth ? plan.myth : null;
    const className = 'diet-pdf-card diet-pdf-myth-card' + (extraClass ? ' ' + extraClass : '');
    return `
      <article class="${className}">
        <div class="diet-pdf-card-kicker">Obalamy mity o diecie</div>
        <h2>Mit kontra fakt</h2>
        <p class="diet-pdf-myth-statement"><strong>Mit:</strong> ${dietRecommendationsEscapeHtml(myth ? myth.myth : '')}</p>
        <p><strong>Fakt:</strong> ${dietRecommendationsEscapeHtml(myth ? myth.fact : '')}</p>
        ${myth && myth.practical ? `<p class="diet-pdf-myth-practical"><strong>Co zrobić w praktyce:</strong> ${dietRecommendationsEscapeHtml(myth.practical)}</p>` : ''}
      </article>`;
  }



  function dietRecommendationsBuildIntegratedPdfPages(model, metaHtml, surveyBadge, metaChipCountClass) {
    const plan = model.plan || {};
    const sections = dietRecommendationsGetIntegratedClassicSections(model.parsedClassic);
    model.integratedClassicSections = sections;
    const state = model.state || {};
    const activityOrOther = (sections.activity.items && sections.activity.items.length) ? sections.activity : sections.other;
    const swapsForReport = dietRecommendationsPdfExpandedSwaps(plan, state, 6);
    const goalsCount = Array.isArray(plan.goals) ? plan.goals.length : 0;
    const goalsCountClass = ' diet-pdf-goals-count-' + Math.max(0, Math.min(3, goalsCount));
    const childSafetyNote = dietPersonalizationIsChildGroup(state.ageGroup) || state.ageGroup === 'teen'
      ? '<div class="diet-pdf-note-box diet-pdf-note-box-compact"><strong>Ważne:</strong> u dzieci i młodzieży liczby dotyczące masy ciała i deficytu energii interpretuj ostrożnie - w kontekście wzrastania, dojrzewania i stanu zdrowia. Priorytetem są bezpieczne nawyki oraz brak zawstydzania pacjenta.</div>'
      : '<div class="diet-pdf-note-box diet-pdf-note-box-compact"><strong>Ważne:</strong> raport jest planem edukacyjnym. Tempo redukcji, deficyt i zalecenia należy dostosować do stanu zdrowia, leków, wyników badań i możliwości pacjenta.</div>';

    const page1Body = `
      <div class="diet-pdf-hero diet-pdf-hero-integrated diet-pdf-hero-compact">
        <div class="diet-pdf-hero-kicker">Plan&nbsp;żywieniowy&nbsp;po&nbsp;konsultacji</div>
        <h2>Obliczenia wyznaczają ramy, a małe kroki pokazują, co robić na co dzień.</h2>
        <p>${dietRecommendationsEscapeHtml(plan.mainGoal || '')}</p>
      </div>
      <div class="diet-pdf-chip-grid diet-pdf-chip-grid-compact${metaChipCountClass}">${metaHtml}</div>
      <div class="diet-pdf-section-head diet-pdf-section-head-tight">
        <span>Ramy planu</span>
      </div>
      <div class="diet-pdf-integrated-framework diet-pdf-integrated-framework-compact">
        ${dietRecommendationsPdfIntegratedSectionCardHtml(sections.weight, { compact: true, maxItems: 2 })}
        ${dietRecommendationsPdfIntegratedSectionCardHtml(sections.energy, { compact: true, maxItems: 1 })}
      </div>
      <div class="diet-pdf-section-head diet-pdf-section-head-tight">
        <span>Plan na 14 dni</span>
      </div>
      <div class="diet-pdf-goals diet-pdf-goals-integrated diet-pdf-goals-compact${goalsCountClass}">${dietRecommendationsPdfGoalsIntegratedHtml(plan, model)}</div>`;

    const page2Body = `
      <div class="diet-pdf-section-head diet-pdf-section-head-tight diet-pdf-section-head-first">
        <span>Posiłki i utrzymanie zmiany</span>
      </div>
      <div class="diet-pdf-practice-grid">
        <article class="diet-pdf-card diet-pdf-plate-card diet-pdf-card-compact">
          <div class="diet-pdf-card-kicker">Model posiłku</div>
          <h2>Jak komponować główny posiłek</h2>
          <p>${dietRecommendationsEscapeHtml(plan.plateText || '')}</p>
          <div class="diet-pdf-plate-visual diet-pdf-plate-visual-compact">
            <div class="diet-pdf-plate-main">
              <span class="diet-pdf-portion-fraction"><span>1/2</span></span>
              <span class="diet-pdf-portion-title">warzywa</span>
              <small>i owoce z przewagą warzyw</small>
            </div>
            <div class="diet-pdf-plate-side">
              <div class="diet-pdf-plate-cell"><span class="diet-pdf-portion-fraction"><span>1/4</span></span><strong>białko</strong></div>
              <div class="diet-pdf-plate-cell"><span class="diet-pdf-portion-fraction"><span>1/4</span></span><strong>zboża / ziemniaki</strong></div>
            </div>
          </div>
        </article>
        ${dietRecommendationsPdfIntegratedSectionCardHtml(sections.nutrition, { compact: true, maxItems: 1 })}
        <article class="diet-pdf-card diet-pdf-card-compact diet-pdf-swaps-card-expanded">
          <div class="diet-pdf-card-kicker">Zamiany produktów</div>
          <h2>Praktyczne zamiany</h2>
          ${dietRecommendationsPdfSwapsHtml(swapsForReport)}
        </article>
        <article class="diet-pdf-card diet-pdf-card-accent diet-pdf-card-compact diet-pdf-eighty-card">
          <div class="diet-pdf-card-kicker">Elastyczność 80/20</div>
          <h2>Co to znaczy w praktyce?</h2>
          ${dietRecommendationsPdfEightyTwentyHtml(plan, state)}
        </article>
      </div>
      <div class="diet-pdf-two-col diet-pdf-two-col-tight">
        ${dietRecommendationsPdfIntegratedSectionCardHtml(activityOrOther, { compact: true, maxItems: 1 })}
        ${dietRecommendationsPdfMythCardHtml(plan, 'diet-pdf-card-compact')}
      </div>
      <article class="diet-pdf-card diet-pdf-tracker-card diet-pdf-tracker-card-compact">
        <div>
          <div class="diet-pdf-card-kicker">Monitorowanie</div>
          <h2>14 dni obserwacji, bez oceniania siebie</h2>
          <p>Zaznacz dni, w których udało się wykonać co najmniej jeden mały krok. Po 14 dniach zostaw 1-2 najłatwiejsze kroki i uprość te, które były zbyt trudne.</p>
        </div>
        ${dietRecommendationsPdfTrackerHtml()}
      </article>
      ${childSafetyNote}`;

    return [
      dietRecommendationsPdfPageHtml(model, page1Body, 'diet-pdf-page-cover diet-pdf-page-integrated diet-pdf-page-tight'),
      dietRecommendationsPdfPageHtml(model, page2Body, 'diet-pdf-page-integrated-closing diet-pdf-page-tight')
    ];
  }

  function dietRecommendationsBuildPdfHtml(model) {
    const metaHtml = dietRecommendationsPdfMetaChipsHtml(model);
    const metaChipCount = (metaHtml.match(/class=\"diet-pdf-chip\"/g) || []).length;
    const metaChipCountClass = ' diet-pdf-chip-count-' + Math.min(6, Math.max(1, metaChipCount));
    const showPersonalized = !!(model.includePersonalized && model.plan);
    const showClassic = !!(model.includeClassic && model.baseResult);
    const plan = model.plan || {};
    const surveyBadge = '';
    const integratedPages = (model.mode === 'full' && showPersonalized && showClassic)
      ? dietRecommendationsBuildIntegratedPdfPages(model, metaHtml, surveyBadge, metaChipCountClass)
      : null;

    const page1Body = showPersonalized ? `
      <div class="diet-pdf-hero">
        <div class="diet-pdf-hero-kicker">Plan&nbsp;żywieniowy&nbsp;po&nbsp;konsultacji</div>
        <h2>Najpierw 2-3 realistyczne kroki, potem kolejne zmiany.</h2>
        <p>${dietRecommendationsEscapeHtml(plan.mainGoal || '')}</p>
      </div>
      <div class="diet-pdf-chip-grid${metaChipCountClass}">${metaHtml}</div>
      <div class="diet-pdf-section-head">
        <span>Plan na 14 dni</span>
      </div>
      <div class="diet-pdf-goals">${dietRecommendationsPdfGoalsHtml(plan)}</div>
    ` : `
      <div class="diet-pdf-hero diet-pdf-hero-classic">
        <h2>Raport energetyczny i zalecenia podstawowe</h2>
        <p>Poniżej zebrano najważniejsze zindywidualizowane zalecenia żywieniowe.</p>
      </div>
      <div class="diet-pdf-chip-grid${metaChipCountClass}">${metaHtml}</div>
      <div class="diet-pdf-card diet-pdf-card-classic diet-pdf-card-classic-main">
        <div class="diet-pdf-classic-fit-content">
          <h2>Obliczenia i zalecenia</h2>
          ${dietRecommendationsPdfClassicHtml(model.parsedClassic)}
        </div>
      </div>
    `;

    const page2Body = showPersonalized ? `
      <div class="diet-pdf-two-col">
        <article class="diet-pdf-card diet-pdf-plate-card">
          <div class="diet-pdf-card-kicker">Model posiłku</div>
          <h2>Jak komponować główny posiłek</h2>
          <p>${dietRecommendationsEscapeHtml(plan.plateText || '')}</p>
          <div class="diet-pdf-plate-visual">
            <div class="diet-pdf-plate-main">
              <span class="diet-pdf-portion-fraction"><span>1/2</span></span>
              <span class="diet-pdf-portion-title">warzywa</span>
              <small>i owoce z przewagą warzyw</small>
            </div>
            <div class="diet-pdf-plate-side">
              <div class="diet-pdf-plate-cell"><span class="diet-pdf-portion-fraction"><span>1/4</span></span><strong>białko</strong></div>
              <div class="diet-pdf-plate-cell"><span class="diet-pdf-portion-fraction"><span>1/4</span></span><strong>zboża / ziemniaki</strong></div>
            </div>
          </div>
        </article>
        <article class="diet-pdf-card">
          <div class="diet-pdf-card-kicker">Zamiany produktów</div>
          <h2>Praktyczne zamiany</h2>
          ${dietRecommendationsPdfSwapsHtml(plan.swaps)}
        </article>
      </div>
      <div class="diet-pdf-two-col diet-pdf-two-col-lower">
        <article class="diet-pdf-card diet-pdf-card-accent diet-pdf-eighty-card">
          <div class="diet-pdf-card-kicker">Elastyczność 80/20</div>
          <h2>Co to znaczy w praktyce?</h2>
          ${dietRecommendationsPdfEightyTwentyHtml(plan, model.state || {})}
        </article>
        ${dietRecommendationsPdfMythCardHtml(plan, '')}
      </div>
      <article class="diet-pdf-card diet-pdf-tracker-card">
        <div>
          <div class="diet-pdf-card-kicker">Monitorowanie</div>
          <h2>14 dni obserwacji, bez oceniania siebie</h2>
          <p>Zaznacz dni, w których udało się wykonać co najmniej jeden mały krok. Celem jest powtarzalność, nie idealny wynik.</p>
        </div>
        ${dietRecommendationsPdfTrackerHtml()}
      </article>
    ` : '';

    const page3Body = showClassic ? `
      <div class="diet-pdf-section-head diet-pdf-section-head-classic">
        <span>Dodatkowy kontekst</span>
        <strong>Obliczenia energetyczne i zalecenia podstawowe</strong>
      </div>
      <div class="diet-pdf-card diet-pdf-card-classic diet-pdf-card-long">
        ${dietRecommendationsPdfClassicHtml(model.parsedClassic)}
      </div>
      <div class="diet-pdf-note-box">
        <strong>Ważne:</strong> u dzieci i młodzieży liczby dotyczące masy ciała i deficytu energii powinny być interpretowane ostrożnie, w kontekście wzrastania, dojrzewania i stanu zdrowia. Priorytetem pozostają bezpieczne, powtarzalne nawyki oraz brak zawstydzania pacjenta.
      </div>
    ` : '';

    const firstPageClassName = showPersonalized ? 'diet-pdf-page-cover' : 'diet-pdf-page-cover diet-pdf-page-classic-single';
    const pages = integratedPages || [dietRecommendationsPdfPageHtml(model, page1Body, firstPageClassName)];
    if (!integratedPages && showPersonalized) pages.push(dietRecommendationsPdfPageHtml(model, page2Body, 'diet-pdf-page-guidance'));
    if (!integratedPages && showClassic && showPersonalized) pages.push(dietRecommendationsPdfPageHtml(model, page3Body, 'diet-pdf-page-classic'));

    return `
      <div class="diet-pdf-root">
        <style>
          .diet-pdf-root { width:1240px; background:#eef7f7; color:#173233; font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; -webkit-text-size-adjust:none; text-size-adjust:none; }
          .diet-pdf-page { width:1240px; min-height:1754px; box-sizing:border-box; position:relative; padding:54px 58px 74px; background:linear-gradient(180deg,#f4fbfb 0%,#fff 22%,#fff 100%); overflow:hidden; }
          .diet-pdf-page::before { content:""; position:absolute; top:-190px; right:-190px; width:460px; height:460px; border-radius:999px; background:rgba(0,131,141,0.08); }
          .diet-pdf-page::after { content:""; position:absolute; left:-160px; bottom:-190px; width:420px; height:420px; border-radius:999px; background:rgba(242,151,39,0.11); }
          .diet-pdf-page > * { position:relative; z-index:1; }
          .diet-pdf-header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin-bottom:28px; text-align:left; }
          .diet-pdf-header-title { text-align:left; max-width:900px; }
          .diet-pdf-brand { color:#007a83; font-size:24px; font-weight:900; letter-spacing:.01em; text-transform:uppercase; text-align:left; }
          .diet-pdf-header h1 { margin:14px 0 0; font-size:44px; line-height:1.06; color:#10292a; font-weight:900; text-align:left; }
          .diet-pdf-header p { margin:10px 0 0; max-width:780px; color:#50696a; font-size:21px; line-height:1.38; }
          .diet-pdf-date { flex:0 0 auto; border:1px solid #d6e8e8; background:#fff; border-radius:18px; padding:13px 16px; color:#365454; font-size:17px; font-weight:700; box-shadow:0 10px 24px rgba(15,77,84,.07); }
          .diet-pdf-hero { border-radius:30px; padding:30px 34px; color:#fff; background:linear-gradient(135deg,#087b85 0%,#0f9ca6 100%); box-shadow:0 24px 50px rgba(0,131,141,.18); }
          .diet-pdf-hero-classic { background:linear-gradient(135deg,#5d4276 0%,#8b50b6 100%); box-shadow:0 24px 50px rgba(91,58,120,.17); }
          .diet-pdf-hero-kicker { display:inline-block; padding:7px 13px; border-radius:999px; background:rgba(255,255,255,.17); font-size:16px; font-weight:800; letter-spacing:0; word-spacing:.08em; text-transform:none; white-space:nowrap; }
          .diet-pdf-hero h2 { margin:0; font-size:35px; line-height:1.12; font-weight:900; }
          .diet-pdf-hero-kicker + h2 { margin-top:18px; }
          .diet-pdf-hero p { margin:14px 0 0; font-size:22px; line-height:1.44; max-width:1030px; }
          .diet-pdf-chip-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:13px; margin-top:22px; width:100%; box-sizing:border-box; align-items:stretch; justify-items:stretch; }
          .diet-pdf-chip-grid.diet-pdf-chip-count-1 { grid-template-columns:1fr; }
          .diet-pdf-chip-grid.diet-pdf-chip-count-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .diet-pdf-chip-grid.diet-pdf-chip-count-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
          .diet-pdf-chip-grid.diet-pdf-chip-count-4 { grid-template-columns:repeat(4,minmax(0,1fr)); }
          .diet-pdf-chip-grid.diet-pdf-chip-count-5 { grid-template-columns:repeat(5,minmax(0,1fr)); }
          .diet-pdf-chip-grid.diet-pdf-chip-count-6 { grid-template-columns:repeat(6,minmax(0,1fr)); }
          .diet-pdf-chip { display:flex; flex-direction:column; justify-content:center; gap:5px; padding:14px 16px; border:2px solid #b7d8d9; border-radius:18px; background:#fff; box-shadow:0 12px 26px rgba(15,77,84,.09); min-height:62px; box-sizing:border-box; }
          .diet-pdf-chip span { color:#5b7374; font-size:14.5px; line-height:1.1; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
          .diet-pdf-chip strong { color:#102d2f; font-size:20px; line-height:1.18; font-weight:900; overflow-wrap:anywhere; }
          .diet-pdf-section-head { display:flex; justify-content:space-between; align-items:center; gap:18px; margin:28px 0 16px; padding-bottom:12px; border-bottom:3px solid #e7f0f0; }
          .diet-pdf-section-head span { color:#f08d28; font-size:19px; font-weight:900; text-transform:uppercase; letter-spacing:.06em; }
          .diet-pdf-section-head strong { color:#436162; font-size:18px; line-height:1.3; text-align:right; }
          .diet-pdf-goals { display:grid; grid-template-columns:1fr; gap:16px; }
          .diet-pdf-goal-card { display:grid; grid-template-columns:64px 1fr; gap:18px; padding:18px; border:1px solid #d9e8e8; border-radius:26px; background:#fff; box-shadow:0 14px 34px rgba(15,77,84,.08); }
          .diet-pdf-goal-number { width:54px; height:54px; display:flex; align-items:center; justify-content:center; border-radius:999px; color:#fff; font-size:25px; font-weight:900; background:linear-gradient(135deg,#f2992c 0%,#f0b255 100%); box-shadow:0 10px 18px rgba(242,151,39,.22); }
          .diet-pdf-goal-copy h3 { margin:0 0 12px; color:#123233; font-size:26px; line-height:1.15; font-weight:900; }
          .diet-pdf-smart-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
          .diet-pdf-smart-grid div { border-radius:16px; background:#f6fbfb; border:1px solid #e0ecec; padding:11px 12px; }
          .diet-pdf-smart-grid span { display:block; color:#087b85; font-size:14px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px; }
          .diet-pdf-smart-grid p { margin:0; color:#244647; font-size:17px; line-height:1.34; }
          .diet-pdf-two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px; }
          .diet-pdf-two-col-lower { margin-top:20px; }
          .diet-pdf-card { border:1px solid #d9e8e8; border-radius:28px; background:#fff; padding:24px; box-shadow:0 14px 34px rgba(15,77,84,.08); }
          .diet-pdf-card-kicker { color:#f08d28; font-size:15px; font-weight:900; letter-spacing:.06em; text-transform:uppercase; margin-bottom:8px; }
          .diet-pdf-card h2 { margin:0 0 12px; color:#143334; font-size:29px; line-height:1.14; font-weight:900; }
          .diet-pdf-card p { margin:0; color:#315253; font-size:19px; line-height:1.46; }
          .diet-pdf-plate-visual { margin-top:22px; display:grid; grid-template-columns:1.1fr .9fr; min-height:210px; overflow:hidden; border-radius:28px; border:1px solid #d8e7e7; }
          .diet-pdf-plate-main { display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; gap:8px; padding:18px; background:#e8f6f2; color:#16635f; font-weight:900; }
          .diet-pdf-portion-fraction { display:inline-grid; place-items:center; box-sizing:border-box; min-width:56px; height:38px; padding:0 13px; border-radius:999px; background:#fff; border:1px solid rgba(8,123,133,.18); color:#087b85; font-size:24px; line-height:1; font-weight:950; text-align:center; box-shadow:0 7px 16px rgba(15,77,84,.08); vertical-align:middle; }
          .diet-pdf-portion-fraction > span { display:block; color:inherit; font:inherit; line-height:1; transform:translateY(-1.25px); }
          .diet-pdf-portion-title { display:block; color:#16635f; font-size:28px; line-height:1.05; font-weight:950; }
          .diet-pdf-plate-main small { display:block; max-width:245px; color:#487370; font-size:16px; line-height:1.25; font-weight:750; }
          .diet-pdf-plate-side { display:grid; grid-template-rows:1fr 1fr; }
          .diet-pdf-plate-cell { display:flex; flex-direction:column; justify-content:center; align-items:center; gap:7px; text-align:center; color:#394c63; font-weight:900; background:#f3f7fb; border-left:1px solid #d8e7e7; padding:10px 12px; min-width:0; }
          .diet-pdf-plate-cell + .diet-pdf-plate-cell { background:#fff7ec; border-top:1px solid #d8e7e7; color:#8d5b17; }
          .diet-pdf-plate-cell .diet-pdf-portion-fraction { min-width:48px; height:31px; padding:0 10px; font-size:18px; color:currentColor; border-color:rgba(0,0,0,.08); box-shadow:none; }
          .diet-pdf-plate-cell .diet-pdf-portion-fraction > span { transform:translateY(-.9px); }
          .diet-pdf-plate-cell strong { display:block; max-width:190px; color:currentColor; font-size:20px; line-height:1.12; font-weight:950; overflow-wrap:normal; }
          .diet-pdf-swaps-table { border:1px solid #dce8e8; border-radius:20px; overflow:hidden; }
          .diet-pdf-swaps-head, .diet-pdf-swap-row { display:grid; grid-template-columns:1fr 1fr; }
          .diet-pdf-swaps-head span { padding:12px 14px; background:#f3f6f6; color:#274849; font-size:16px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
          .diet-pdf-swap-row span { padding:12px 14px; color:#315253; font-size:17px; line-height:1.32; border-top:1px solid #e6eeee; }
          .diet-pdf-swap-row span + span { border-left:1px solid #e6eeee; color:#174f53; font-weight:700; }
          .diet-pdf-card-accent { background:#fff8ed; border-color:#f1d3aa; }
          .diet-pdf-myth-card { background:#f7fbfb; border-color:#cfe4e4; }
          .diet-pdf-myth-card h2 { color:#0f5358; }
          .diet-pdf-myth-card p + p { margin-top:8px; }
          .diet-pdf-myth-card strong { color:#087b85; font-weight:900; }
          .diet-pdf-myth-statement { margin:0 0 8px !important; padding:9px 11px; border:1px solid #d9e8e8; border-radius:14px; background:#fff; color:#173233 !important; font-weight:760; }
          .diet-pdf-myth-practical { margin-top:9px !important; padding-top:9px; border-top:1px solid #e0eeee; color:#274849 !important; }
          .diet-pdf-myth-practical strong { color:#087b85; font-weight:900; }
          .diet-pdf-tracker-card { margin-top:20px; display:block; }
          .diet-pdf-tracker-days { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:10px; margin-top:14px; width:100%; }
          .diet-pdf-tracker-days span { height:50px; border-radius:15px; border:2px solid #cfe1e1; display:flex; align-items:center; justify-content:center; color:#335152; font-size:20px; font-weight:900; background:#fff; }
          .diet-pdf-section-head-classic { margin-top:8px; }
          .diet-pdf-card-classic { margin-top:0; }
          .diet-pdf-card-classic-main { margin-top:22px; }
          .diet-pdf-card-classic h2 { margin-bottom:18px; font-size:31px; }
          .diet-pdf-classic-intro { margin:0 0 14px; font-size:21px; color:#315253; line-height:1.5; }
          .diet-pdf-classic-list { margin:0; padding-left:0; list-style:none; counter-reset:dietClassic; display:grid; gap:14px; }
          .diet-pdf-classic-list li { counter-increment:dietClassic; display:grid; grid-template-columns:46px 1fr; gap:14px; align-items:start; padding:16px 17px; border:1px solid #d7e6e6; border-radius:20px; background:#fbfdfd; }
          .diet-pdf-classic-list li::before { content:counter(dietClassic); width:38px; height:38px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:#eaf6f6; color:#007a83; font-weight:900; font-size:18px; }
          .diet-pdf-classic-list li span { color:#244647; font-size:21px; line-height:1.48; }
          .diet-pdf-page-classic-single { height:1754px; min-height:1754px; max-height:1754px; padding:50px 58px 74px; overflow:hidden; }
          .diet-pdf-page-classic-single .diet-pdf-header { margin-bottom:22px; }
          .diet-pdf-page-classic-single .diet-pdf-header h1 { font-size:42px; }
          .diet-pdf-page-classic-single .diet-pdf-header p { font-size:20px; }
          .diet-pdf-page-classic-single .diet-pdf-hero { padding:26px 34px; border-radius:28px; }
          .diet-pdf-page-classic-single .diet-pdf-hero h2 { font-size:34px; }
          .diet-pdf-page-classic-single .diet-pdf-hero p { font-size:21px; line-height:1.36; }
          .diet-pdf-page-classic-single .diet-pdf-chip-grid { margin-top:22px; }
          .diet-pdf-page-classic-single .diet-pdf-card-classic-main { box-sizing:border-box; transform-origin:top left; }
          .diet-pdf-classic-fit-content { transform-origin:top left; width:100%; }
          .diet-pdf-card-classic-main.diet-pdf-card-classic-scaled .diet-pdf-classic-fit-content { transform:scale(var(--classic-fit-scale,1)); }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 { padding-top:44px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-header { margin-bottom:18px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-header h1 { font-size:39px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-header p { font-size:18.5px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-date { padding:10px 13px; font-size:15.5px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-hero { padding:22px 28px; border-radius:24px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-hero h2 { font-size:31px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-hero p { margin-top:8px; font-size:18.8px; line-height:1.3; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-chip-grid { gap:10px; margin-top:16px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-chip { min-height:55px; padding:11px 13px; border-radius:16px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-chip span { font-size:12.6px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-chip strong { font-size:18px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-card-classic-main { margin-top:16px; padding:20px 21px; border-radius:24px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-card-classic h2 { margin-bottom:13px; font-size:29px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-classic-list { gap:9px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-classic-list li { grid-template-columns:40px 1fr; gap:11px; padding:12px 14px; border-radius:17px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-classic-list li::before { width:33px; height:33px; font-size:15.5px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-1 .diet-pdf-classic-list li span { font-size:19px; line-height:1.36; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 { padding-top:38px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-header { margin-bottom:14px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-brand { font-size:21px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-header h1 { margin-top:8px; font-size:35px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-header p { margin-top:6px; font-size:17.5px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-date { padding:9px 12px; font-size:14.8px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-hero { padding:18px 24px; border-radius:22px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-hero h2 { font-size:28px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-hero p { margin-top:7px; font-size:17.2px; line-height:1.27; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-chip-grid { gap:8px; margin-top:12px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-chip { min-height:50px; padding:9px 11px; border-radius:14px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-chip span { font-size:11.5px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-chip strong { font-size:16.8px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-card-classic-main { margin-top:13px; padding:16px 18px; border-radius:21px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-card-classic h2 { margin-bottom:10px; font-size:26px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-classic-list { gap:7px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-classic-list li { grid-template-columns:35px 1fr; gap:9px; padding:9px 11px; border-radius:15px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-classic-list li::before { width:29px; height:29px; font-size:14px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-2 .diet-pdf-classic-list li span { font-size:17px; line-height:1.29; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 { padding-top:34px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-header { margin-bottom:10px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-header h1 { font-size:32px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-header p { display:none; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-hero { padding:16px 22px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-hero h2 { font-size:26px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-hero p { font-size:16px; line-height:1.24; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-chip-grid { margin-top:10px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-card-classic-main { margin-top:10px; padding:14px 16px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-classic-list { gap:6px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-classic-list li { padding:8px 10px; }
          .diet-pdf-page-classic-single.diet-pdf-classic-density-3 .diet-pdf-classic-list li span { font-size:15.8px; line-height:1.24; }
          .diet-pdf-card-long { margin-top:12px; }
          .diet-pdf-integrated-framework { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:16px; }
          .diet-pdf-integrated-framework-single { grid-template-columns:1fr; margin-top:20px; }
          .diet-pdf-integrated-card { border:1px solid #d9e8e8; border-radius:26px; background:#fff; padding:21px 22px; box-shadow:0 14px 34px rgba(15,77,84,.08); }
          .diet-pdf-integrated-card-primary { background:linear-gradient(180deg,#ffffff 0%,#f4fbfb 100%); border-color:#cde4e4; }
          .diet-pdf-integrated-card--wide { grid-column:1 / -1; }
          .diet-pdf-integrated-card--compact { padding:20px 22px; }
          .diet-pdf-integrated-card h3 { margin:0 0 11px; color:#143334; font-size:27px; line-height:1.14; font-weight:900; }
          .diet-pdf-integrated-card p { margin:0; color:#315253; font-size:18px; line-height:1.45; }
          .diet-pdf-integrated-list { margin:0; padding:0; list-style:none; display:grid; gap:10px; }
          .diet-pdf-integrated-list li { position:relative; padding-left:22px; color:#244647; font-size:17px; line-height:1.42; }
          .diet-pdf-integrated-list li::before { content:""; position:absolute; left:0; top:.58em; width:9px; height:9px; border-radius:999px; background:#f2992c; box-shadow:0 0 0 4px rgba(242,153,44,.14); }
          .diet-pdf-integrated-empty { margin:0; color:#5f7677; font-size:17px; line-height:1.42; }
          .diet-pdf-hero-integrated { background:linear-gradient(135deg,#087b85 0%,#0f9ca6 62%,#f29a2e 160%); }
          .diet-pdf-goal-card-integrated { padding:16px 18px; }
          .diet-pdf-goal-context { margin-top:12px; border-radius:17px; background:#fff8ed; border:1px solid #f1d3aa; padding:12px 14px; }
          .diet-pdf-goal-context span { display:block; color:#9a610e; font-size:14px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px; }
          .diet-pdf-goal-context p { margin:0; color:#4c3a24; font-size:16px; line-height:1.36; }
          .diet-pdf-tracker-card-integrated { margin-top:20px; }
          .diet-pdf-note-box { margin-top:18px; padding:18px 20px; border-radius:22px; background:#fff8ed; border:1px solid #f0d1a4; color:#4c3a24; font-size:18px; line-height:1.45; }
          .diet-pdf-note-box-integrated { margin-top:18px; }
          .diet-pdf-empty { color:#6d8080; font-size:18px; padding:16px; border-radius:18px; background:#f7fbfb; }
          .diet-pdf-footer { position:absolute; left:58px; right:58px; bottom:26px; display:flex; justify-content:space-between; align-items:center; gap:18px; border:1px solid #d7e8e8; border-radius:18px; padding:10px 14px; color:#315253; font-size:13.8px; font-weight:750; background:linear-gradient(90deg,rgba(235,249,249,.98) 0%,rgba(255,249,239,.98) 100%); box-shadow:0 10px 24px rgba(15,77,84,.08); }
          .diet-pdf-footer-note { display:flex; align-items:center; gap:9px; min-width:0; line-height:1.25; }
          .diet-pdf-footer-note span:last-child { white-space:normal; }
          .diet-pdf-footer-dot { width:10px; height:10px; flex:0 0 auto; border-radius:999px; background:#f2992c; box-shadow:0 0 0 5px rgba(242,153,44,.16); }
          .diet-pdf-footer-brand { flex:0 0 auto; color:#087b85; font-size:15px; font-weight:950; letter-spacing:.01em; white-space:nowrap; }
          .diet-pdf-page-tight { height:1754px; min-height:1754px; padding:38px 50px 64px; }
          .diet-pdf-page-tight .diet-pdf-header { margin-bottom:14px; }
          .diet-pdf-page-tight .diet-pdf-brand { font-size:22px; }
          .diet-pdf-page-tight .diet-pdf-header h1 { margin-top:8px; font-size:42px; line-height:1.04; }
          .diet-pdf-page-tight .diet-pdf-header p { margin-top:7px; font-size:19px; line-height:1.3; max-width:820px; }
          .diet-pdf-page-tight .diet-pdf-date { padding:10px 13px; border-radius:16px; font-size:15px; }
          .diet-pdf-hero-compact { border-radius:22px; padding:18px 24px; }
          .diet-pdf-hero-compact .diet-pdf-hero-kicker { padding:6px 12px; font-size:16px; letter-spacing:0; word-spacing:.08em; text-transform:none; white-space:nowrap; }
          .diet-pdf-hero-compact h2 { margin-top:10px; font-size:30px; line-height:1.1; max-width:1040px; }
          .diet-pdf-hero-compact p { margin-top:8px; font-size:19px; line-height:1.35; max-width:1040px; }
          .diet-pdf-chip-grid-compact { grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; margin-top:12px; width:100%; }
          .diet-pdf-chip-grid-compact .diet-pdf-chip { padding:11px 12px; min-height:56px; border-radius:15px; border-width:2px; border-color:#a9cfd0; box-shadow:0 9px 20px rgba(15,77,84,.08); }
          .diet-pdf-chip-grid-compact .diet-pdf-chip span { font-size:13.5px; letter-spacing:.025em; }
          .diet-pdf-chip-grid-compact .diet-pdf-chip strong { font-size:18.2px; line-height:1.15; }
          .diet-pdf-section-head-tight { margin:14px 0 9px; padding-bottom:7px; border-bottom-width:2px; }
          .diet-pdf-section-head-first { margin-top:2px; }
          .diet-pdf-section-head-tight span { font-size:18px; letter-spacing:.035em; }
          .diet-pdf-section-head-tight strong { font-size:16px; }
          .diet-pdf-integrated-framework-compact { grid-template-columns:1.08fr .92fr; gap:11px; margin-top:9px; }
          .diet-pdf-page-tight .diet-pdf-integrated-card { border-radius:20px; padding:15px 16px; }
          .diet-pdf-page-tight .diet-pdf-integrated-card h3 { margin-bottom:7px; font-size:23px; line-height:1.1; }
          .diet-pdf-page-tight .diet-pdf-integrated-card p { font-size:17px; line-height:1.34; }
          .diet-pdf-page-tight .diet-pdf-card-kicker { margin-bottom:5px; font-size:14px; letter-spacing:.025em; }
          .diet-pdf-page-tight .diet-pdf-integrated-list { gap:6px; }
          .diet-pdf-page-tight .diet-pdf-integrated-list li { padding-left:17px; font-size:16.2px; line-height:1.34; }
          .diet-pdf-page-tight .diet-pdf-integrated-list li::before { width:6px; height:6px; box-shadow:0 0 0 3px rgba(242,153,44,.13); }
          .diet-pdf-page-tight .diet-pdf-integrated-empty { font-size:16.2px; line-height:1.34; }
          .diet-pdf-goals-compact { gap:var(--integrated-goal-gap,12px); }
          .diet-pdf-goal-card-compact { grid-template-columns:48px 1fr; gap:var(--integrated-goal-col-gap,12px); padding:var(--integrated-goal-pad-y,15px) var(--integrated-goal-pad-x,17px); border-radius:22px; }
          .diet-pdf-goal-card-compact .diet-pdf-goal-number { width:42px; height:42px; font-size:20px; }
          .diet-pdf-goal-card-compact .diet-pdf-goal-copy h3 { margin-bottom:7px; font-size:23.5px; line-height:1.1; }
          .diet-pdf-goals-count-3 { --integrated-goal-gap:14px; --integrated-goal-pad-y:16px; --integrated-goal-pad-x:18px; --integrated-goal-col-gap:13px; }
          .diet-pdf-goals-count-2 { --integrated-goal-gap:18px; --integrated-goal-pad-y:20px; --integrated-goal-pad-x:20px; --integrated-goal-col-gap:14px; }
          .diet-pdf-goals-count-1 { --integrated-goal-gap:18px; --integrated-goal-pad-y:24px; --integrated-goal-pad-x:22px; --integrated-goal-col-gap:15px; }
          .diet-pdf-goal-main { margin:0 0 8px; color:#244647; font-size:17.3px; line-height:1.32; }
          .diet-pdf-goal-main strong, .diet-pdf-goal-why strong { color:#0b737b; font-weight:900; }
          .diet-pdf-goal-mini-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
          .diet-pdf-goal-mini-grid div { border-radius:14px; background:#f6fbfb; border:1px solid #d9e8e8; padding:9px 10px; }
          .diet-pdf-goal-mini-grid span { display:block; color:#087b85; font-size:13.5px; font-weight:900; text-transform:uppercase; letter-spacing:.02em; margin-bottom:3px; }
          .diet-pdf-goal-mini-grid p { margin:0; color:#244647; font-size:15.8px; line-height:1.28; }
          .diet-pdf-goal-why { margin:0; color:#334f50; font-size:15.9px; line-height:1.31; }
          .diet-pdf-goal-why em { display:block; margin-top:3px; color:#6a5a3f; font-style:normal; }
          .diet-pdf-practice-grid { display:grid; grid-template-columns:1fr 1fr; gap:11px; margin-top:9px; }
          .diet-pdf-card-compact { border-radius:21px; padding:15px 16px; }
          .diet-pdf-card-compact h2 { margin-bottom:7px; font-size:24.5px; line-height:1.1; }
          .diet-pdf-card-compact p { font-size:17px; line-height:1.34; }
          .diet-pdf-plate-visual-compact { margin-top:12px; min-height:132px; border-radius:20px; }
          .diet-pdf-plate-visual-compact .diet-pdf-plate-main { padding:10px; gap:5px; }
          .diet-pdf-plate-visual-compact .diet-pdf-portion-fraction { min-width:44px; height:28px; padding:0 9px; font-size:17px; }
          .diet-pdf-plate-visual-compact .diet-pdf-portion-fraction > span { transform:translateY(-.85px); }
          .diet-pdf-plate-visual-compact .diet-pdf-portion-title { font-size:20px; }
          .diet-pdf-plate-visual-compact .diet-pdf-plate-main small { font-size:11.5px; max-width:170px; line-height:1.15; }
          .diet-pdf-plate-visual-compact .diet-pdf-plate-cell { gap:4px; padding:7px 8px; }
          .diet-pdf-plate-visual-compact .diet-pdf-plate-cell .diet-pdf-portion-fraction { min-width:38px; height:24px; padding:0 8px; font-size:14px; }
          .diet-pdf-plate-visual-compact .diet-pdf-plate-cell .diet-pdf-portion-fraction > span { transform:translateY(-.65px); }
          .diet-pdf-plate-visual-compact .diet-pdf-plate-cell strong { font-size:13.5px; line-height:1.1; max-width:150px; }
          .diet-pdf-page-tight .diet-pdf-swaps-table { border-radius:15px; }
          .diet-pdf-page-tight .diet-pdf-swaps-head span { padding:8px 10px; font-size:13px; letter-spacing:.025em; }
          .diet-pdf-page-tight .diet-pdf-swap-row span { padding:8px 10px; font-size:15.4px; line-height:1.27; }
          .diet-pdf-page-tight .diet-pdf-swaps-card-expanded .diet-pdf-swaps-table { border-radius:14px; }
          .diet-pdf-page-tight .diet-pdf-swaps-card-expanded .diet-pdf-swaps-head span { padding:7px 8px; font-size:12.2px; }
          .diet-pdf-page-tight .diet-pdf-swaps-card-expanded .diet-pdf-swap-row span { padding:7px 8px; font-size:14.1px; line-height:1.19; }
          .diet-pdf-eighty-card { grid-row:span 1; }
          .diet-pdf-eighty-lead { margin:0 0 7px !important; font-weight:760; }
          .diet-pdf-eighty-split { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:0 0 8px; }
          .diet-pdf-eighty-split div { border-radius:15px; background:#fff; border:1px solid #f1d3aa; padding:8px 9px; }
          .diet-pdf-eighty-split strong { display:block; color:#f08d28; font-size:24px; line-height:1; font-weight:900; }
          .diet-pdf-eighty-split span { display:block; margin-top:3px; color:#5b4328; font-size:14.5px; line-height:1.15; font-weight:800; }
          .diet-pdf-eighty-list { margin:0; padding:0; list-style:none; display:grid; gap:4px; }
          .diet-pdf-eighty-list li { position:relative; padding-left:16px; color:#4c3a24; font-size:15.1px; line-height:1.24; }
          .diet-pdf-eighty-list li::before { content:""; position:absolute; left:0; top:.55em; width:6px; height:6px; border-radius:999px; background:#f2992c; }
          .diet-pdf-two-col-tight { gap:12px; margin-top:12px; }
          .diet-pdf-two-col-tight .diet-pdf-card, .diet-pdf-two-col-tight .diet-pdf-integrated-card { border-radius:20px; padding:14px 15px; }
          .diet-pdf-two-col-tight .diet-pdf-card h2 { margin-bottom:6px; font-size:22px; }
          .diet-pdf-two-col-tight .diet-pdf-card p { font-size:16.3px; line-height:1.32; }
          .diet-pdf-tracker-card-compact { margin-top:12px; display:block; border-radius:20px; padding:15px 18px; }
          .diet-pdf-tracker-card-compact h2 { margin-bottom:5px; font-size:24px; }
          .diet-pdf-tracker-card-compact p { font-size:16.5px; line-height:1.32; max-width:100%; }
          .diet-pdf-tracker-card-compact .diet-pdf-tracker-days { grid-template-columns:repeat(7,minmax(0,1fr)); gap:9px; margin-top:12px; }
          .diet-pdf-tracker-card-compact .diet-pdf-tracker-days span { height:45px; border-radius:13px; font-size:18px; border-width:2px; }
          .diet-pdf-note-box-compact { margin-top:10px; padding:10px 13px; border-radius:16px; font-size:16px; line-height:1.28; }
          .diet-pdf-page-tight .diet-pdf-footer { left:50px; right:50px; bottom:18px; padding:8px 12px; border-radius:17px; font-size:12.8px; }
          .diet-pdf-page-tight .diet-pdf-footer-brand { font-size:13.4px; }
          .diet-pdf-page-tight .diet-pdf-footer-note { gap:8px; }
          .diet-pdf-page-tight .diet-pdf-footer-dot { width:8px; height:8px; box-shadow:0 0 0 4px rgba(242,153,44,.14); }

        </style>
        ${pages.join('')}
      </div>`;
  }


  function dietRecommendationsStretchIntegratedGoalsPage(pageNode) {
    if (!pageNode || !pageNode.querySelector || !(pageNode.classList && pageNode.classList.contains('diet-pdf-page-integrated'))) return;
    const goals = pageNode.querySelector('.diet-pdf-goals-integrated');
    if (!goals) return;
    const cards = Array.prototype.slice.call(goals.querySelectorAll('.diet-pdf-goal-card-compact'));
    if (!cards.length) return;

    goals.style.removeProperty('--integrated-goal-gap');
    goals.style.removeProperty('--integrated-goal-pad-y');
    goals.style.removeProperty('--integrated-goal-pad-x');
    cards.forEach(function(card) { card.style.minHeight = ''; });
    void goals.offsetHeight;

    const footer = pageNode.querySelector('.diet-pdf-footer');
    const footerRect = footer ? footer.getBoundingClientRect() : null;
    const pageRect = pageNode.getBoundingClientRect();
    const footerTop = footerRect ? footerRect.top : (pageRect.top + (pageNode.clientHeight || 1754) - 62);
    let goalsRect = goals.getBoundingClientRect();
    let extra = footerTop - goalsRect.bottom - 24;
    if (!Number.isFinite(extra) || extra <= 24) return;

    const count = cards.length;
    const computedGoals = window.getComputedStyle ? window.getComputedStyle(goals) : null;
    const computedCard = window.getComputedStyle ? window.getComputedStyle(cards[0]) : null;
    const currentGap = computedGoals ? (parseFloat(computedGoals.rowGap || computedGoals.gap) || 0) : 0;
    const currentPadY = computedCard ? (parseFloat(computedCard.paddingTop) || 0) : 0;
    const currentPadX = computedCard ? (parseFloat(computedCard.paddingLeft) || 0) : 0;

    // Wykorzystujemy wolną przestrzeń ostrożnie: cele mają być wyraźniejsze,
    // ale nadal ma zostać niewielki oddech nad stopką.
    const usableExtra = Math.max(0, Math.min(extra, count >= 3 ? 130 : 190));
    if (count > 1) {
      const gapLimit = count >= 3 ? 24 : 30;
      const gapIncrease = Math.min(gapLimit - currentGap, usableExtra * 0.28 / Math.max(1, count - 1));
      if (gapIncrease > 0) goals.style.setProperty('--integrated-goal-gap', (currentGap + gapIncrease).toFixed(2) + 'px');
    }

    const gapGain = count > 1
      ? (parseFloat(goals.style.getPropertyValue('--integrated-goal-gap')) || currentGap) - currentGap
      : 0;
    const remainingAfterGap = Math.max(0, usableExtra - Math.max(0, gapGain) * Math.max(0, count - 1));
    const padLimit = count >= 3 ? 23 : 32;
    const padIncrease = Math.min(padLimit - currentPadY, remainingAfterGap / Math.max(1, count * 2));
    if (padIncrease > 0) {
      goals.style.setProperty('--integrated-goal-pad-y', (currentPadY + padIncrease).toFixed(2) + 'px');
      goals.style.setProperty('--integrated-goal-pad-x', Math.max(currentPadX, currentPadX + Math.min(4, padIncrease * 0.4)).toFixed(2) + 'px');
    }

    void goals.offsetHeight;
    goalsRect = goals.getBoundingClientRect();
    extra = footerTop - goalsRect.bottom - 24;
    if (extra > 38) {
      const stretchPerCard = Math.min(count >= 3 ? 24 : 54, extra / count);
      cards.forEach(function(card) {
        const currentHeight = card.getBoundingClientRect().height || 0;
        if (currentHeight > 0) card.style.minHeight = Math.round(currentHeight + stretchPerCard) + 'px';
      });
    }
  }

  function dietRecommendationsFitClassicSinglePdfPage(pageNode) {
    if (!pageNode || !pageNode.classList || !pageNode.classList.contains('diet-pdf-page-classic-single')) return;
    const card = pageNode.querySelector('.diet-pdf-card-classic-main');
    const content = card ? card.querySelector('.diet-pdf-classic-fit-content') : null;
    if (!card || !content) return;

    const densityClasses = [
      'diet-pdf-classic-density-1',
      'diet-pdf-classic-density-2',
      'diet-pdf-classic-density-3'
    ];

    function clearClassicFit() {
      card.classList.remove('diet-pdf-card-classic-scaled');
      densityClasses.forEach(function(cls) { pageNode.classList.remove(cls); });
      card.style.removeProperty('--classic-fit-scale');
      card.style.height = '';
      card.style.maxHeight = '';
      card.style.minHeight = '';
      card.style.overflow = '';
      content.style.width = '';
    }

    function applyDensity(level) {
      densityClasses.forEach(function(cls) { pageNode.classList.remove(cls); });
      if (level >= 1) pageNode.classList.add('diet-pdf-classic-density-1');
      if (level >= 2) pageNode.classList.add('diet-pdf-classic-density-2');
      if (level >= 3) pageNode.classList.add('diet-pdf-classic-density-3');
      card.classList.remove('diet-pdf-card-classic-scaled');
      card.style.removeProperty('--classic-fit-scale');
      card.style.height = '';
      card.style.maxHeight = '';
      card.style.minHeight = '';
      card.style.overflow = '';
      content.style.width = '';
      void pageNode.offsetHeight;
    }

    function measureClassicLayout() {
      const footer = pageNode.querySelector('.diet-pdf-footer');
      const cardRect = card.getBoundingClientRect();
      const footerRect = footer ? footer.getBoundingClientRect() : null;
      const pageRect = pageNode.getBoundingClientRect();
      const footerTop = footerRect ? footerRect.top : (pageRect.top + (pageNode.clientHeight || 1754) - 56);
      const availableTotal = Math.max(360, footerTop - cardRect.top - 18);
      const cardStyle = window.getComputedStyle ? window.getComputedStyle(card) : null;
      const paddingTop = cardStyle ? parseFloat(cardStyle.paddingTop) || 0 : 0;
      const paddingBottom = cardStyle ? parseFloat(cardStyle.paddingBottom) || 0 : 0;
      const borderTop = cardStyle ? parseFloat(cardStyle.borderTopWidth) || 0 : 0;
      const borderBottom = cardStyle ? parseFloat(cardStyle.borderBottomWidth) || 0 : 0;
      const availableInner = Math.max(260, availableTotal - paddingTop - paddingBottom - borderTop - borderBottom);
      const contentHeight = Math.max(content.scrollHeight || 0, content.getBoundingClientRect().height || 0);
      return { availableTotal, availableInner, contentHeight };
    }

    function applyClassicScale(scale) {
      const normalizedScale = Math.max(0.22, Math.min(1.42, Number(scale) || 1));
      if (Math.abs(normalizedScale - 1) < 0.012) {
        card.classList.remove('diet-pdf-card-classic-scaled');
        card.style.removeProperty('--classic-fit-scale');
        content.style.width = '';
      } else {
        card.style.setProperty('--classic-fit-scale', String(normalizedScale));
        content.style.width = (100 / normalizedScale) + '%';
        card.classList.add('diet-pdf-card-classic-scaled');
      }
      void content.offsetHeight;
      return Math.max(content.getBoundingClientRect().height || 0, (content.scrollHeight || 0) * normalizedScale);
    }

    clearClassicFit();

    // Najpierw wybieramy najmniej zagęszczony wariant, który mieści się na jednej stronie.
    // Dopiero potem, jeśli zostaje dużo wolnego miejsca, powiększamy sam blok zaleceń.
    let selectedLevel = 3;
    for (let level = 0; level <= 3; level += 1) {
      applyDensity(level);
      const metrics = measureClassicLayout();
      selectedLevel = level;
      if (!metrics.contentHeight || metrics.contentHeight <= metrics.availableInner * 0.965) break;
    }

    applyDensity(selectedLevel);
    let metrics = measureClassicLayout();
    if (!metrics.contentHeight) return;

    card.style.height = metrics.availableTotal + 'px';
    card.style.minHeight = metrics.availableTotal + 'px';
    card.style.maxHeight = metrics.availableTotal + 'px';
    card.style.overflow = 'hidden';

    const itemCount = card.querySelectorAll('.diet-pdf-classic-list li').length;
    const targetMax = metrics.availableInner * 0.955;
    const targetMin = metrics.availableInner * (itemCount <= 5 ? 0.76 : 0.82);
    const maxUpscale = itemCount <= 4 ? 1.42 : (itemCount <= 7 ? 1.32 : 1.22);
    let finalScale = 1;

    if (metrics.contentHeight > targetMax) {
      let low = 0.22;
      let high = 1;
      for (let i = 0; i < 12; i += 1) {
        const mid = (low + high) / 2;
        const visualHeight = applyClassicScale(mid);
        if (visualHeight <= targetMax) low = mid;
        else high = mid;
      }
      finalScale = low;
    } else if (metrics.contentHeight < targetMin) {
      let low = 1;
      let high = maxUpscale;
      for (let i = 0; i < 12; i += 1) {
        const mid = (low + high) / 2;
        const visualHeight = applyClassicScale(mid);
        if (visualHeight <= targetMax) low = mid;
        else high = mid;
      }
      finalScale = low;
    }

    applyClassicScale(finalScale);
  }

  async function dietRecommendationsCollectPdfPages(options) {
    const opts = options || {};
    const mode = dietRecommendationsNormalizePdfMode(opts.mode || opts.variant || 'full');
    if (typeof window !== 'undefined' && typeof window.vildaEnsurePdfLibraries === 'function') { try { await window.vildaEnsurePdfLibraries(); } catch (e) {} } // PERF: lazy jsPDF/html2canvas
    vildaEnsureGlobalDependencyContract('diet-recommendations-pdf', { silent: true, showUi: true, message: 'Brakuje bibliotek potrzebnych do wygenerowania PDF zaleceń dietetycznych.' });
    const dietPdfJsPDF = vildaRequireGlobalFunction('jspdf.jsPDF', 'diet-recommendations-pdf', { silent: true });
    const dietPdfHtml2Canvas = vildaRequireGlobalFunction('html2canvas', 'diet-recommendations-pdf', { silent: true });
    if (!dietPdfJsPDF || !dietPdfHtml2Canvas) {
      throw new Error('Brakuje bibliotek potrzebnych do wygenerowania PDF.');
    }
    if (typeof patientReportCreateRenderHost !== 'function'
      || typeof patientReportWaitForStableLayout !== 'function'
      || typeof patientReportResolveRenderScale !== 'function'
      || typeof patientReportBuildPdfPageSpecFromCanvas !== 'function'
      || typeof patientReportSliceCanvasToPageSpecs !== 'function') {
      throw new Error('Generator raportu PDF nie jest jeszcze gotowy. Odśwież stronę i spróbuj ponownie.');
    }

    const model = dietRecommendationsBuildPdfModel(mode);
    const host = patientReportCreateRenderHost(1240);
    try {
      vildaAppSetTrustedHtml(host, dietRecommendationsBuildPdfHtml(model), 'app:host');
      document.body.appendChild(host);
      await patientReportWaitForStableLayout();
      const pageNodes = Array.prototype.slice.call(host.querySelectorAll('.diet-pdf-page'));
      if (!pageNodes.length) throw new Error('Brak stron raportu zaleceń do renderowania.');
      const pages = [];
      for (let i = 0; i < pageNodes.length; i += 1) {
        const pageNode = pageNodes[i];
        const forceSingleA4Page = model.mode === 'full'
          || model.mode === 'classic'
          || (pageNode.classList && pageNode.classList.contains('diet-pdf-page-tight'));
        if (model.mode === 'full') {
          dietRecommendationsStretchIntegratedGoalsPage(pageNode);
          await patientReportWaitForStableLayout();
        }
        if (model.mode === 'classic') {
          dietRecommendationsFitClassicSinglePdfPage(pageNode);
          await patientReportWaitForStableLayout();
        }
        const renderScale = patientReportResolveRenderScale(pageNode, { desiredScale: 2 });
        const canvasOptions = {
          scale: renderScale,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          imageTimeout: 0
        };
        if (forceSingleA4Page) {
          canvasOptions.width = pageNode.offsetWidth || 1240;
          canvasOptions.height = pageNode.offsetHeight || 1754;
          canvasOptions.windowWidth = Math.max(document.documentElement.clientWidth || 0, pageNode.offsetWidth || 1240);
          canvasOptions.windowHeight = Math.max(document.documentElement.clientHeight || 0, pageNode.offsetHeight || 1754);
        }
        const canvas = await dietPdfHtml2Canvas(pageNode, canvasOptions);

        if (forceSingleA4Page) {
          const fixedPageSpec = patientReportBuildPdfPageSpecFromCanvas(canvas, {
            orientation: 'portrait',
            format: 'JPEG',
            widthMm: 210,
            heightMm: 297
          });
          if (fixedPageSpec) pages.push(fixedPageSpec);
        } else {
          const pageSpecs = patientReportSliceCanvasToPageSpecs(canvas, { orientation: 'portrait', format: 'JPEG' });
          pages.push.apply(pages, pageSpecs.filter(Boolean));
        }
      }
      return {
        pages,
        filenameBase: model.filenameBase || 'pacjent',
        title: model.title,
        mode
      };
    } finally {
      try { host.remove(); } catch (error) { vildaLogAppWarn('diet-recommendations-pdf', 'Nie udało się usunąć hosta renderowania PDF zaleceń', error); }
    }
  }

  async function dietRecommendationsBuildPdfPackage(mode) {
    const jsPDF = vildaRequireGlobalFunction('jspdf.jsPDF', 'diet-recommendations-pdf');
    if (!jsPDF) {
      throw new Error('Brakuje biblioteki jsPDF potrzebnej do wygenerowania pliku PDF.');
    }
    const collected = await dietRecommendationsCollectPdfPages({ mode });
    const validPages = (collected.pages || []).filter(function(page) { return page && page.dataUrl; });
    if (!validPages.length) throw new Error('Nie udało się przygotować raportu zaleceń dietetycznych.');
    const firstPage = validPages[0];
    const pdf = new jsPDF({
      orientation: firstPage.orientation || 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
      putOnlyUsedFonts: true
    });
    pdf.setProperties({
      title: collected.title || 'Raport zaleceń dietetycznych',
      subject: collected.title || 'Raport zaleceń dietetycznych',
      author: 'wagaiwzrost.pl'
    });
    validPages.forEach(function(page, index) {
      const pageOrientation = page.orientation === 'landscape' ? 'landscape' : 'portrait';
      if (index > 0) pdf.addPage('a4', pageOrientation);
      pdf.addImage(
        page.dataUrl,
        page.format || 'JPEG',
        0,
        0,
        Number.isFinite(page.widthMm) ? page.widthMm : 210,
        Number.isFinite(page.heightMm) ? page.heightMm : 297,
        undefined,
        (typeof PATIENT_REPORT_PDF_IMAGE_COMPRESSION !== 'undefined' ? PATIENT_REPORT_PDF_IMAGE_COMPRESSION : 'FAST')
      );
    });
    const variantSlug = dietRecommendationsNormalizePdfMode(collected.mode || mode);
    return {
      blob: pdf.output('blob'),
      filename: `Raport_zalecen_dietetycznych_${variantSlug}_${collected.filenameBase || 'pacjent'}.pdf`
    };
  }

  async function generateDietRecommendationsPdfReport(triggerBtn, mode) {
    const normalizedMode = dietRecommendationsNormalizePdfMode(mode);
    const task = async function() {
      const pdfPackage = await dietRecommendationsBuildPdfPackage(normalizedMode);
      if (!pdfPackage || !(pdfPackage.blob instanceof Blob)) {
        throw new Error('Nie udało się przygotować pliku PDF.');
      }
      patientReportDownloadBlob(pdfPackage.blob, pdfPackage.filename);
      patientReportShowToast('Raport zaleceń dietetycznych PDF został wygenerowany.');
    };
    try {
      if (typeof patientReportRunExternalPdfTask === 'function') {
        await patientReportRunExternalPdfTask(triggerBtn, task, 'Przygotowywanie PDF…');
      } else {
        if (triggerBtn) triggerBtn.disabled = true;
        await task();
        if (triggerBtn) triggerBtn.disabled = false;
      }
    } catch (error) {
      if (triggerBtn) triggerBtn.disabled = false;
      console.error('Błąd generowania raportu zaleceń dietetycznych PDF:', error);
      if (!(error && error.vildaDependencyError)) {
        if (typeof patientReportShowToast === 'function') {
          patientReportShowToast(error && error.message ? error.message : 'Nie udało się wygenerować raportu zaleceń dietetycznych.');
        } else {
          vildaShowDependencyFallbackNotice(error && error.message ? error.message : 'Nie udało się wygenerować raportu zaleceń dietetycznych.');
        }
      }
    }
  }

  function dietRecommendationsHasPdfAvailable() {
    try {
      const btn = document.getElementById('dietRecommendationsBtn');
      if (btn) {
        const computed = window.getComputedStyle ? window.getComputedStyle(btn) : null;
        return btn.style.display !== 'none' && (!computed || computed.display !== 'none');
      }
      const age = getAgeDecimalInternal();
      const weight = parseFloat(document.getElementById('weight')?.value);
      const height = parseFloat(document.getElementById('height')?.value);
      return Number.isFinite(age) && age > 5 && Number.isFinite(weight) && weight > 0 && Number.isFinite(height) && height > 0;
    } catch (error) {
      vildaLogAppWarn('app:persistence', 'Nie udało się rozpoznać krytycznego pola wzrastania', error);
      return false;
    }
  }

  function dietRecommendationsEnsurePdfChoiceStyles() {
    if (document.getElementById('dietRecommendationsPdfChoiceStyles')) return;
    const style = document.createElement('style');
    style.id = 'dietRecommendationsPdfChoiceStyles';
    style.textContent = `
      #dietRecommendationsPdfChoiceBackdrop.diet-pdf-choice-backdrop { position:fixed; inset:0; z-index:100200; display:flex; align-items:center; justify-content:center; padding:18px; background:rgba(11,32,34,.52); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); }
      .diet-pdf-choice-dialog { width:min(94vw,760px); max-height:calc(100vh - 36px); overflow:auto; border-radius:22px; background:#fff; box-shadow:0 26px 70px rgba(0,0,0,.28); border:1px solid #d8e8e8; }
      .diet-pdf-choice-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding:20px 22px 0; }
      .diet-pdf-choice-title { margin:0; color:#123233; font-size:1.1rem; line-height:1.22; }
      .diet-pdf-choice-description { margin:.35rem 0 0; color:#496364; font-size:.92rem; line-height:1.45; }
      .diet-pdf-choice-close { flex:0 0 auto; width:2rem; height:2rem; border:0; border-radius:999px; background:#eef6f6; color:#294849; font-size:1.35rem; line-height:1; cursor:pointer; }
      .diet-pdf-choice-body { padding:16px 22px 0; }
      .diet-pdf-choice-option { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px; align-items:center; padding:13px 0; border-top:1px solid #e8eeee; cursor:pointer; }
      .diet-pdf-choice-option:first-child { border-top:0; }
      .diet-pdf-choice-option.is-selected .diet-pdf-choice-option-title { color:#007a83; }
      .diet-pdf-choice-option-title { display:block; color:#143334; font-size:.98rem; font-weight:800; line-height:1.25; }
      .diet-pdf-choice-option-description { display:block; margin-top:.25rem; color:#5b7071; font-size:.86rem; line-height:1.38; }
      .diet-pdf-choice-radio { width:1.15rem !important; height:1.15rem !important; min-width:1.15rem !important; accent-color:#00838d; }
      .diet-pdf-choice-footer { display:flex; justify-content:flex-end; gap:10px; padding:18px 22px 22px; }
      .diet-pdf-choice-cancel, .diet-pdf-choice-confirm { border-radius:14px; padding:.78rem 1.1rem; font-size:.94rem; font-weight:800; cursor:pointer; }
      .diet-pdf-choice-cancel { border:1px solid #cfe0e0; background:#fff; color:#294849; }
      .diet-pdf-choice-confirm { border:1px solid #00838d; background:#00838d; color:#fff; box-shadow:0 10px 22px rgba(0,131,141,.18); }
      @media(max-width:640px){ .diet-pdf-choice-dialog{width:100%; max-height:calc(100dvh - 20px); border-radius:16px;} .diet-pdf-choice-header{padding:16px 16px 0;} .diet-pdf-choice-body{padding:12px 16px 0;} .diet-pdf-choice-footer{display:grid; grid-template-columns:1fr; padding:16px;} .diet-pdf-choice-cancel,.diet-pdf-choice-confirm{width:100%;} }
    `;
    document.head.appendChild(style);
  }

  function dietRecommendationsRemovePdfChoiceDialog() {
    try {
      const backdrop = document.getElementById('dietRecommendationsPdfChoiceBackdrop');
      if (!backdrop) return;
      if (document.body && typeof backdrop.dataset.prevBodyOverflow === 'string') document.body.style.overflow = backdrop.dataset.prevBodyOverflow;
      if (document.documentElement && typeof backdrop.dataset.prevHtmlOverflow === 'string') document.documentElement.style.overflow = backdrop.dataset.prevHtmlOverflow;
      backdrop.remove();
    } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 10041 });
    }
  }
  }

  function dietRecommendationsOpenPdfChoiceDialog(triggerBtn) {
    dietRecommendationsEnsurePdfChoiceStyles();
    dietRecommendationsRemovePdfChoiceDialog();
    const options = [
      {
        value: 'full',
        title: 'Pełny raport zaleceń (rekomendowane)',
        description: 'Plan po wizycie: obliczenia, cele na 14 dni, talerz, zamiany, zasada 80/20 i monitorowanie w jednej uporządkowanej całości.'
      },
      {
        value: 'personalized',
        title: 'Plan zmiany nawyków i cele SMART',
        description: 'Spersonalizowany plan 14-dniowy: priorytety z ankiety, praktyczne zamiany produktów, mit/fakt i zasada małych kroków.'
      },
      {
        value: 'classic',
        title: 'Raport energetyczny i zalecenia podstawowe',
        description: 'Podsumowanie obliczeń, strategii żywieniowej oraz bazowych zaleceń dotyczących energii, masy ciała i aktywności.'
      }
    ];
    const backdrop = document.createElement('div');
    backdrop.id = 'dietRecommendationsPdfChoiceBackdrop';
    backdrop.className = 'diet-pdf-choice-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'diet-pdf-choice-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'dietRecommendationsPdfChoiceTitle');
    vildaAppSetTrustedHtml(dialog, `
      <div class="diet-pdf-choice-header">
        <div>
          <h3 id="dietRecommendationsPdfChoiceTitle" class="diet-pdf-choice-title">Wybierz wariant raportu zaleceń dietetycznych</h3>
          <p class="diet-pdf-choice-description">Domyślnie wybierany jest pełny raport zaleceń: obliczenia aplikacji wyznaczają ramy, a małe kroki pokazują praktyczne działania.</p>
        </div>
        <button type="button" class="diet-pdf-choice-close" data-diet-pdf-choice-close aria-label="Zamknij">×</button>
      </div>
      <div class="diet-pdf-choice-body">
        <form id="dietRecommendationsPdfChoiceForm">
          ${options.map(function(option, idx) {
            return `
              <label class="diet-pdf-choice-option${idx === 0 ? ' is-selected' : ''}">
                <span>
                  <span class="diet-pdf-choice-option-title">${dietRecommendationsEscapeHtml(option.title)}</span>
                  <span class="diet-pdf-choice-option-description">${dietRecommendationsEscapeHtml(option.description)}</span>
                </span>
                <input class="diet-pdf-choice-radio" type="radio" name="dietPdfReportMode" value="${dietRecommendationsEscapeHtml(option.value)}" ${idx === 0 ? 'checked' : ''}>
              </label>`;
          }).join('')}
        </form>
      </div>
      <div class="diet-pdf-choice-footer">
        <button type="button" class="diet-pdf-choice-cancel" data-diet-pdf-choice-cancel>Anuluj</button>
        <button type="button" class="diet-pdf-choice-confirm" data-diet-pdf-choice-confirm>Generuj PDF</button>
      </div>
    `, 'app:dialog');
    const previousBodyOverflow = document.body ? document.body.style.overflow : '';
    const previousHtmlOverflow = document.documentElement ? document.documentElement.style.overflow : '';
    backdrop.dataset.prevBodyOverflow = previousBodyOverflow;
    backdrop.dataset.prevHtmlOverflow = previousHtmlOverflow;
    if (document.body) document.body.style.overflow = 'hidden';
    if (document.documentElement) document.documentElement.style.overflow = 'hidden';
    const cleanup = function() {
      try { document.removeEventListener('keydown', onKeyDown); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 10106 });
    }
  }
      dietRecommendationsRemovePdfChoiceDialog();
    };
    const onKeyDown = function(event) {
      if (event.key === 'Escape') cleanup();
    };
    dialog.querySelectorAll('input[name="dietPdfReportMode"]').forEach(function(input) {
      input.addEventListener('change', function() {
        dialog.querySelectorAll('.diet-pdf-choice-option').forEach(function(label) {
          const radio = label.querySelector('input[name="dietPdfReportMode"]');
          label.classList.toggle('is-selected', !!(radio && radio.checked));
        });
      });
    });
    dialog.querySelector('[data-diet-pdf-choice-close]')?.addEventListener('click', cleanup);
    dialog.querySelector('[data-diet-pdf-choice-cancel]')?.addEventListener('click', cleanup);
    dialog.querySelector('[data-diet-pdf-choice-confirm]')?.addEventListener('click', function() {
      const checked = dialog.querySelector('input[name="dietPdfReportMode"]:checked');
      const mode = checked ? checked.value : 'full';
      cleanup();
      generateDietRecommendationsPdfReport(triggerBtn, mode);
    });
    backdrop.addEventListener('click', function(event) {
      if (event.target === backdrop) cleanup();
    });
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKeyDown);
    try { dialog.querySelector('input[name="dietPdfReportMode"]:checked')?.focus({ preventScroll: true }); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 10134 });
    }
  }
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__dietRecommendationsPdfDelegatedClickAttached) {
    document.addEventListener('click', function(event) {
      const btn = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('[data-diet-report-pdf-btn]')
        : null;
      if (!btn) return;
      event.preventDefault();
      dietRecommendationsOpenPdfChoiceDialog(btn);
    });
    window.__dietRecommendationsPdfDelegatedClickAttached = true;
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined' && !window.__dietRecommendationsMythNextDelegatedClickAttached) {
    document.addEventListener('click', function(event) {
      const btn = event.target && typeof event.target.closest === 'function'
        ? event.target.closest('[data-diet-myth-next]')
        : null;
      if (!btn) return;
      event.preventDefault();
      dietRecommendationsRequestNewMyth();
      refreshDietRecommendationsIfVisible();
    });
    window.__dietRecommendationsMythNextDelegatedClickAttached = true;
  }

  function enhanceDietRecommendationResult(baseResult) {
    if (!baseResult) return baseResult;
    const state = collectDietPersonalizationState();
    const plan = buildPersonalizedDietPlan(state);
    return {
      textOutput: buildPersonalizedDietPlanText(plan, baseResult),
      htmlOutput: buildPersonalizedDietPlanHtml(plan, baseResult),
      surveyCompleted: !!(plan && plan.state && plan.state.surveyCompleted)
    };
  }

  function getDietToggleGroupByInputId(inputId) {
    const input = document.getElementById(inputId);
    if (!input || typeof input.closest !== 'function') return null;
    return input.closest('.diet-toggle-group');
  }

  function setDietToggleGroupVisible(inputId, visible) {
    const group = getDietToggleGroupByInputId(inputId);
    if (group) {
      group.style.display = visible ? '' : 'none';
    }
  }

  function syncDietRecommendationControlsForAge() {
    const age = getAgeDecimalInternal();
    const isAdult = age >= ENERGY_ADULT_START_AGE;
    const columns = document.querySelector('#dietStrategyOptions .diet-toggle-columns');
    const leftCol = columns ? columns.querySelector('.col-left') : null;
    const rightCol = columns ? columns.querySelector('.col-right') : null;
    const reduceToggle = document.getElementById('reduceToggle');
    const stabilizationToggle = document.getElementById('stabilizationToggle');
    const growthEndedFlag = document.getElementById('growthEndedFlag');
    const vitDFlag = document.getElementById('vitDSuppFlag');
    const hydrationFlag = document.getElementById('hydrationFlag');
    const patientFacingToggle = document.getElementById('patientFacingToggle');
    const journeyFlag = document.getElementById('journeyFlag');
    const nutritionNormsFlag = document.getElementById('nutritionNormsFlag');

    if (isAdult) {
      if (columns) columns.style.gridTemplateColumns = '1fr';
      if (leftCol) leftCol.style.display = 'none';
      if (rightCol) {
        rightCol.style.display = 'flex';
        rightCol.style.gridColumn = '1 / -1';
      }
      setDietToggleGroupVisible('reduceToggle', false);
      setDietToggleGroupVisible('stabilizationToggle', false);
      setDietToggleGroupVisible('growthEndedFlag', false);
      setDietToggleGroupVisible('vitDSuppFlag', false);
      setDietToggleGroupVisible('hydrationFlag', false);
      setDietToggleGroupVisible('patientFacingToggle', true);
      setDietToggleGroupVisible('journeyFlag', true);
      setDietToggleGroupVisible('nutritionNormsFlag', true);
      if (reduceToggle) {
        reduceToggle.checked = true;
        reduceToggle.disabled = true;
      }
      if (stabilizationToggle) {
        stabilizationToggle.disabled = true;
      }
      if (growthEndedFlag) {
        growthEndedFlag.disabled = true;
      }
      if (vitDFlag) {
        vitDFlag.disabled = true;
      }
      if (hydrationFlag) {
        hydrationFlag.disabled = true;
      }
      if (patientFacingToggle) {
        patientFacingToggle.disabled = false;
      }
      if (journeyFlag) {
        journeyFlag.disabled = false;
      }
      if (nutritionNormsFlag) {
        nutritionNormsFlag.disabled = false;
      }
    } else {
      if (columns) columns.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      if (leftCol) leftCol.style.display = 'flex';
      if (rightCol) {
        rightCol.style.display = 'flex';
        rightCol.style.gridColumn = '';
      }
      setDietToggleGroupVisible('reduceToggle', true);
      setDietToggleGroupVisible('growthEndedFlag', true);
      setDietToggleGroupVisible('vitDSuppFlag', true);
      setDietToggleGroupVisible('hydrationFlag', true);
      setDietToggleGroupVisible('patientFacingToggle', true);
      setDietToggleGroupVisible('journeyFlag', true);
      setDietToggleGroupVisible('nutritionNormsFlag', true);
      const growthEnded = !!(growthEndedFlag && growthEndedFlag.checked);
      setDietToggleGroupVisible('stabilizationToggle', !growthEnded);
      if (reduceToggle) {
        reduceToggle.disabled = false;
      }
      if (stabilizationToggle) {
        stabilizationToggle.disabled = false;
      }
      if (growthEndedFlag) {
        growthEndedFlag.disabled = false;
      }
      if (vitDFlag) {
        vitDFlag.disabled = false;
      }
      if (hydrationFlag) {
        hydrationFlag.disabled = false;
      }
      if (patientFacingToggle) {
        patientFacingToggle.disabled = false;
      }
      if (journeyFlag) {
        journeyFlag.disabled = false;
      }
      if (nutritionNormsFlag) {
        nutritionNormsFlag.disabled = false;
      }
      if (typeof window.updateStabilizationEligibility === 'function') {
        try { window.updateStabilizationEligibility(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 10282 });
    }
  }
      }
    }
    try { updateDietModernControlsState(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 10285 });
    }
  }
  }

  function formatDietRecommendationNumber(value, digits) {
    const precision = Number.isFinite(digits) ? digits : 1;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '';
    if (typeof patientReportFormatNumber === 'function') {
      try {
        return patientReportFormatNumber(numeric, precision);
      } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 10295 });
    }
  }
    }
    return numeric.toFixed(precision).replace('.', ',');
  }

  function formatDietRecommendationKg(value, digits) {
    return `${formatDietRecommendationNumber(value, Number.isFinite(digits) ? digits : 1)} kg`;
  }

  const DIET_RECOMMENDATION_KCAL_PER_GRAM = {
    protein: 4,
    carbs: 4,
    fat: 9
  };

  function formatDietRecommendationPercentRangeValue(minValue, maxValue, digits) {
    const precision = Number.isFinite(digits) ? digits : 0;
    const min = Number(minValue);
    const max = Number(maxValue);
    if (!(Number.isFinite(min) && Number.isFinite(max))) return '';
    if (Math.abs(min - max) < 0.05) {
      return `około ${formatDietRecommendationNumber((min + max) / 2, precision)}% energii`;
    }
    return `${formatDietRecommendationNumber(min, precision)}–${formatDietRecommendationNumber(max, precision)}% energii`;
  }

  function formatDietRecommendationPercentRange(range, digits) {
    return Array.isArray(range)
      ? formatDietRecommendationPercentRangeValue(range[0], range[1], Number.isFinite(digits) ? digits : 0)
      : '';
  }

  function formatDietRecommendationGramRange(range, digits) {
    const precision = Number.isFinite(digits) ? digits : 0;
    if (!Array.isArray(range)) return '';
    const min = Number(range[0]);
    const max = Number(range[1]);
    if (!(Number.isFinite(min) && Number.isFinite(max))) return '';
    if (Math.abs(min - max) < 0.05) {
      return `${formatDietRecommendationNumber((min + max) / 2, precision)} g/d`;
    }
    return `${formatDietRecommendationNumber(min, precision)}–${formatDietRecommendationNumber(max, precision)} g/d`;
  }

  function computeDietRecommendationMacroGramRange(energyKcal, percentRange, kcalPerGram) {
    const energy = Number(energyKcal);
    const factor = Number(kcalPerGram);
    if (!(Number.isFinite(energy) && energy > 0 && Array.isArray(percentRange) && percentRange.length === 2 && Number.isFinite(factor) && factor > 0)) {
      return null;
    }
    return [
      (energy * Number(percentRange[0]) / 100) / factor,
      (energy * Number(percentRange[1]) / 100) / factor
    ];
  }

  function resolveDietRecommendationTargetEnergyKcal(chosenDiet, nutritionModel) {
    const chosenIntake = chosenDiet ? Number(chosenDiet.intake) : NaN;
    if (Number.isFinite(chosenIntake) && chosenIntake > 0) {
      return Math.round(chosenIntake);
    }
    const mainValue = nutritionModel && nutritionModel.energy ? Number(nutritionModel.energy.mainValue) : NaN;
    if (Number.isFinite(mainValue) && mainValue > 0) {
      return Math.round(mainValue);
    }
    const range = nutritionModel && nutritionModel.energy && Array.isArray(nutritionModel.energy.range)
      ? nutritionModel.energy.range.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
      : [];
    if (range.length) {
      const midpoint = range.length === 1 ? range[0] : (range[0] + range[range.length - 1]) / 2;
      if (Number.isFinite(midpoint) && midpoint > 0) {
        return Math.round(midpoint);
      }
    }
    return null;
  }

  function buildDietNutritionNormsSummary(options) {
    const opts = options || {};
    if (!(typeof window !== 'undefined' && typeof window.nutritionNormsBuildCardModel === 'function')) {
      return null;
    }

    const ageYears = Number(opts.ageYears);
    const ageMonthsOpt = Number(opts.ageMonthsOpt) || 0;
    const weightKg = Number(opts.weightKg);
    const heightCm = Number(opts.heightCm);
    if (!(Number.isFinite(ageYears) && ageYears > 0 && Number.isFinite(weightKg) && weightKg > 0 && Number.isFinite(heightCm) && heightCm > 0)) {
      return null;
    }

    const basicsFromDom = (typeof window.nutritionNormsReadBasicsFromDom === 'function')
      ? window.nutritionNormsReadBasicsFromDom()
      : {};
    const currentUiState = (typeof window.nutritionNormsGetUiState === 'function')
      ? (window.nutritionNormsGetUiState() || {})
      : {};
    const normsPalSelector = currentUiState && currentUiState.palSelector
      ? String(currentUiState.palSelector)
      : 'inherit';
    const numericNormsPal = Number(normsPalSelector);
    const basics = {
      ...basicsFromDom,
      ageYears,
      ageMonthsOpt,
      sex: opts.sex || basicsFromDom.sex || 'M',
      weightKg,
      heightCm,
      // PAL z „Planu odchudzania” jest deklaracją do obliczenia deficytu.
      // Normy makroskładników i ich procentowe cele opieramy na wyborze PAL
      // w karcie „Normy żywieniowe: białko, tłuszcz, węglowodany”.
      mainPal: Number.isFinite(numericNormsPal) ? numericNormsPal : basicsFromDom.mainPal
    };

    const palSelector = normsPalSelector;
    // W zaleceniach dietetycznych makroskładniki liczymy dla aktualnej masy ciała,
    // ale z PAL wybranym w karcie norm. PAL w planie redukcji pozostaje wyłącznie
    // deklarowanym scenariuszem aktywności do wyliczania deficytu energetycznego.
    const lockedBodyMode = 'actual';

    let model;
    try {
      model = window.nutritionNormsBuildCardModel(basics, {
        ...currentUiState,
        bodyMode: lockedBodyMode,
        palSelector,
        includeInSummary: false
      });
    } catch (_) {
      model = null;
    }
    if (!model || !model.protein || !model.fat || !model.carbs) return null;

    const targetEnergyKcal = resolveDietRecommendationTargetEnergyKcal(opts.chosenDiet, model);
    if (!(Number.isFinite(targetEnergyKcal) && targetEnergyKcal > 0)) return null;

    const proteinMain = model.protein && model.protein.main ? model.protein.main : null;
    const proteinRdaG = proteinMain ? Number(proteinMain.rdaGDay) : NaN;
    const proteinEarG = proteinMain ? Number(proteinMain.earGDay) : NaN;
    const proteinRdaShareRange = (Number.isFinite(proteinEarG) && proteinEarG > 0 && Number.isFinite(proteinRdaG) && proteinRdaG > 0)
      ? [
          (proteinEarG * DIET_RECOMMENDATION_KCAL_PER_GRAM.protein / targetEnergyKcal) * 100,
          (proteinRdaG * DIET_RECOMMENDATION_KCAL_PER_GRAM.protein / targetEnergyKcal) * 100
        ]
      : null;
    const proteinPlanningPercentRange = model.protein && Array.isArray(model.protein.planningPercentRange)
      ? model.protein.planningPercentRange
      : null;
    const proteinPlanningGramRange = computeDietRecommendationMacroGramRange(
      targetEnergyKcal,
      proteinPlanningPercentRange,
      DIET_RECOMMENDATION_KCAL_PER_GRAM.protein
    );

    const fatRange = computeDietRecommendationMacroGramRange(targetEnergyKcal, model.fat.percentRange, DIET_RECOMMENDATION_KCAL_PER_GRAM.fat);
    const carbRange = computeDietRecommendationMacroGramRange(targetEnergyKcal, model.carbs.percentRange, DIET_RECOMMENDATION_KCAL_PER_GRAM.carbs);

    if (!proteinPlanningGramRange && !(Number.isFinite(proteinRdaG) && proteinRdaG > 0) && !fatRange && !carbRange) {
      return null;
    }

    return {
      model,
      targetEnergyKcal,
      basisLabel: model.energy && model.energy.basisLabel ? String(model.energy.basisLabel) : '',
      proteinRdaG,
      proteinEarG,
      proteinRdaShareRange,
      proteinPlanningPercentRange,
      proteinPlanningGramRange,
      fatPercentRange: model.fat ? model.fat.percentRange : null,
      fatGramRange: fatRange,
      carbPercentRange: model.carbs ? model.carbs.percentRange : null,
      carbGramRange: carbRange
    };
  }

  function buildDietNutritionNormsLines(options) {
    const opts = options || {};
    const summary = buildDietNutritionNormsSummary(opts);
    if (!summary) return [];

    const targetEnergyLabel = `${formatDietRecommendationNumber(summary.targetEnergyKcal, 0)} kcal/d`;
    const proteinRdaLabel = Number.isFinite(summary.proteinRdaG) ? `${formatDietRecommendationNumber(summary.proteinRdaG, 0)} g/d` : '';
    const proteinEarLabel = Number.isFinite(summary.proteinEarG) ? `${formatDietRecommendationNumber(summary.proteinEarG, 0)} g/d` : '';
    const proteinRdaShareLabel = summary.proteinRdaShareRange ? formatDietRecommendationPercentRange(summary.proteinRdaShareRange, 0) : '';
    const proteinPlanningGramLabel = formatDietRecommendationGramRange(summary.proteinPlanningGramRange, 0);
    const proteinPlanningPercentLabel = formatDietRecommendationPercentRange(summary.proteinPlanningPercentRange, 0);
    const fatGramLabel = formatDietRecommendationGramRange(summary.fatGramRange, 0);
    const fatPercentLabel = formatDietRecommendationPercentRange(summary.fatPercentRange, 0);
    const carbGramLabel = formatDietRecommendationGramRange(summary.carbGramRange, 0);
    const carbPercentLabel = formatDietRecommendationPercentRange(summary.carbPercentRange, 0);
    const patientFacing = !!opts.patientFacing;
    const isAdult = !!opts.isAdult;
    const toChild = !!opts.toChild;
    const lines = [];

    if (patientFacing) {
      const subject = isAdult
        ? `Przy kaloryczności planu około ${targetEnergyLabel}`
        : (toChild ? `Przy kaloryczności planu około ${targetEnergyLabel}` : `W diecie dziecka przy kaloryczności planu około ${targetEnergyLabel}`);
      const patientParts = [];
      if (proteinPlanningGramLabel && proteinPlanningPercentLabel) {
        let proteinText = `białko około ${proteinPlanningGramLabel.replace(' g/d', ' g dziennie')} (${proteinPlanningPercentLabel})`;
        if (proteinRdaLabel) proteinText += `; minimum referencyjne RDA ${proteinRdaLabel}`;
        patientParts.push(proteinText);
      } else if (proteinRdaLabel) {
        let proteinText = `co najmniej około ${proteinRdaLabel.replace(' g/d', ' g białka dziennie')}`;
        if (proteinRdaShareLabel) proteinText += ` (EAR/RDA odpowiada ${proteinRdaShareLabel})`;
        patientParts.push(proteinText);
      } else {
        patientParts.push('odpowiednią ilość białka');
      }
      if (fatGramLabel && fatPercentLabel) {
        patientParts.push(`tłuszcze około ${fatGramLabel.replace(' g/d', ' g dziennie')} (${fatPercentLabel})`);
      }
      if (carbGramLabel && carbPercentLabel) {
        patientParts.push(`węglowodany około ${carbGramLabel.replace(' g/d', ' g dziennie')} (${carbPercentLabel})`);
      }
      const combinedPatientLine = patientReportFormatIssueList(patientParts);
      if (combinedPatientLine) {
        lines.push(`${subject} warto zwykle zaplanować ${combinedPatientLine}.`);
      }
    } else {
      const baseLineParts = [];
      if (proteinPlanningGramLabel && proteinPlanningPercentLabel) {
        let proteinText = `białko do planowania ${proteinPlanningGramLabel} (${proteinPlanningPercentLabel})`;
        if (proteinRdaLabel) proteinText += `; RDA ${proteinRdaLabel}`;
        if (proteinEarLabel) proteinText += ` (EAR ${proteinEarLabel})`;
        if (proteinRdaShareLabel) proteinText += `; EAR/RDA odpowiada ${proteinRdaShareLabel}`;
        baseLineParts.push(proteinText);
      } else if (proteinRdaLabel) {
        let proteinText = `białko RDA ${proteinRdaLabel}`;
        if (proteinEarLabel) proteinText += ` (EAR ${proteinEarLabel})`;
        if (proteinRdaShareLabel) proteinText += `; EAR/RDA odpowiada ${proteinRdaShareLabel}`;
        baseLineParts.push(proteinText);
      }
      if (fatGramLabel && fatPercentLabel) {
        baseLineParts.push(`tłuszcz ${fatGramLabel} (${fatPercentLabel})`);
      }
      if (carbGramLabel && carbPercentLabel) {
        baseLineParts.push(`węglowodany ${carbGramLabel} (${carbPercentLabel})`);
      }
      if (baseLineParts.length) {
        lines.push(`Normy żywieniowe dla planu około ${targetEnergyLabel}: ${baseLineParts.join('; ')}.`);
      }
      if (summary.basisLabel) {
        lines.push(`Przeliczenie wykonano dla trybu: ${summary.basisLabel}.`);
      }
    }

    return lines;
  }

  function getDietPalLabel(pal) {
    const numeric = Number(pal);
    if (!Number.isFinite(numeric)) return '';
    const fixed = numeric.toFixed(1);
    return PAL_OPTIONS[fixed] || PAL_OPTIONS[String(numeric)] || PAL_OPTIONS[numeric] || '';
  }

  function getDietLevelPhrase(chosenDiet, grammaticalCase) {
    const name = String(chosenDiet && chosenDiet.name ? chosenDiet.name : '').trim().toLowerCase();
    const dictionary = {
      lekka: { acc: 'dietę lekką', nom: 'dieta lekka' },
      umiarkowana: { acc: 'dietę umiarkowaną', nom: 'dieta umiarkowana' },
      intensywna: { acc: 'dietę intensywną', nom: 'dieta intensywna' }
    };
    const entry = dictionary[name];
    if (entry) {
      return grammaticalCase === 'nom' ? entry.nom : entry.acc;
    }
    if (!name) return grammaticalCase === 'nom' ? 'dobrany plan żywieniowy' : 'dobrany plan żywieniowy';
    return grammaticalCase === 'nom' ? `dieta ${name}` : `dietę ${name}`;
  }

  function hasAdultDietWhrRisk() {
    const whrInfo = document.getElementById('whrInfo');
    if (!whrInfo || whrInfo.style.display === 'none') return false;
    return whrInfo.classList.contains('whr-warning') || whrInfo.classList.contains('whr-danger');
  }

  function dietRecommendationsGetActiveMode() {
    const active = document.querySelector('#dietRecommendationsContent .diet-mode-tab.is-active[data-diet-mode]');
    const mode = active ? active.getAttribute('data-diet-mode') : '';
    return mode === 'energy' || mode === 'pdf' ? mode : 'smart';
  }

  function dietRecommendationsSetActiveMode(mode) {
    const normalized = mode === 'energy' || mode === 'pdf' ? mode : 'smart';
    const content = document.getElementById('dietRecommendationsContent');
    if (!content) return;
    Array.prototype.slice.call(content.querySelectorAll('[data-diet-mode]')).forEach(function(tab) {
      const isActive = tab.getAttribute('data-diet-mode') === normalized;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    Array.prototype.slice.call(content.querySelectorAll('[data-diet-panel]')).forEach(function(panel) {
      const isActive = panel.getAttribute('data-diet-panel') === normalized;
      panel.classList.toggle('is-active', isActive);
      if (isActive) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
    });
    updateDietModernControlsState();
  }

  function dietRecommendationsDispatchChange(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {
      try {
        const evt = document.createEvent('HTMLEvents');
        evt.initEvent('change', true, false);
        el.dispatchEvent(evt);
      } catch (__) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', __, { line: 10609 });
    }
  }
    }
  }

  function updateDietModernControlsState() {
    const age = getAgeDecimalInternal();
    const isAdult = age >= ENERGY_ADULT_START_AGE;
    const reduceToggle = document.getElementById('reduceToggle');
    const stabilizationToggle = document.getElementById('stabilizationToggle');
    const patientFacingToggle = document.getElementById('patientFacingToggle');

    const stabilizationChoice = document.querySelector('[data-diet-strategy-choice="stabilization"]');
    if (stabilizationChoice) {
      stabilizationChoice.hidden = isAdult;
      stabilizationChoice.disabled = isAdult || !!(stabilizationToggle && stabilizationToggle.disabled);
    }

    const isStabilization = !!(stabilizationToggle && stabilizationToggle.checked && !(reduceToggle && reduceToggle.checked));
    Array.prototype.slice.call(document.querySelectorAll('[data-diet-strategy-choice]')).forEach(function(btn) {
      const value = btn.getAttribute('data-diet-strategy-choice');
      btn.classList.toggle('is-active', value === (isStabilization ? 'stabilization' : 'reduction'));
      btn.setAttribute('aria-pressed', value === (isStabilization ? 'stabilization' : 'reduction') ? 'true' : 'false');
    });

    const audience = patientFacingToggle && patientFacingToggle.checked ? 'patient' : 'specialist';
    Array.prototype.slice.call(document.querySelectorAll('[data-diet-audience-choice]')).forEach(function(btn) {
      const value = btn.getAttribute('data-diet-audience-choice');
      btn.classList.toggle('is-active', value === audience);
      btn.setAttribute('aria-pressed', value === audience ? 'true' : 'false');
    });
  }

  function dietRecommendationsAttachModernUiHandlers() {
    if (typeof document === 'undefined' || window.__dietModernUiHandlersAttached) return;
    document.addEventListener('click', function(event) {
      const target = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-diet-mode], [data-diet-strategy-choice], [data-diet-audience-choice], [data-diet-copy-result], [data-diet-report-direct]') : null;
      if (!target) return;

      if (target.matches('[data-diet-mode]')) {
        event.preventDefault();
        dietRecommendationsSetActiveMode(target.getAttribute('data-diet-mode'));
        return;
      }

      if (target.matches('[data-diet-strategy-choice]')) {
        event.preventDefault();
        const value = target.getAttribute('data-diet-strategy-choice');
        const reduceToggle = document.getElementById('reduceToggle');
        const stabilizationToggle = document.getElementById('stabilizationToggle');
        if (value === 'stabilization' && stabilizationToggle && !stabilizationToggle.disabled) {
          if (reduceToggle) reduceToggle.checked = false;
          stabilizationToggle.checked = true;
          dietRecommendationsDispatchChange(stabilizationToggle);
        } else {
          if (stabilizationToggle) stabilizationToggle.checked = false;
          if (reduceToggle) reduceToggle.checked = true;
          dietRecommendationsDispatchChange(reduceToggle);
        }
        updateDietModernControlsState();
        return;
      }

      if (target.matches('[data-diet-audience-choice]')) {
        event.preventDefault();
        const patientFacingToggle = document.getElementById('patientFacingToggle');
        if (patientFacingToggle && !patientFacingToggle.disabled) {
          patientFacingToggle.checked = target.getAttribute('data-diet-audience-choice') === 'patient';
          dietRecommendationsDispatchChange(patientFacingToggle);
        }
        updateDietModernControlsState();
        return;
      }

      if (target.matches('[data-diet-copy-result]')) {
        event.preventDefault();
        const type = target.getAttribute('data-diet-copy-result') === 'energy' ? 'energy' : 'smart';
        const payload = dietRecommendationsLastOutputs[type];
        if (!payload || !payload.textOutput) return;
        copyDietTextToClipboard(payload.textOutput).then(function() {
          if (typeof showMetabolicToast === 'function') showMetabolicToast();
        }).catch(function() {
          if (typeof showMetabolicToast === 'function') showMetabolicToast();
        });
        return;
      }

      if (target.matches('[data-diet-report-direct]')) {
        event.preventDefault();
        const mode = target.getAttribute('data-diet-report-direct') || 'full';
        generateDietRecommendationsPdfReport(target, mode);
      }
    });
    window.__dietModernUiHandlersAttached = true;
  }

  function dietRecommendationsToggleResultActions(type, visible) {
    const selector = type === 'energy' ? '[data-diet-energy-actions]' : '[data-diet-smart-actions]';
    const el = document.querySelector(selector);
    if (!el) return;
    if (visible) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
  }

  function buildDietSmartRecommendationResult() {
    syncDietRecommendationControlsForAge();
    ensureDietPersonalizationSurveyUi(document.getElementById('dietRecommendationsContent'));
    const state = collectDietPersonalizationState();
    const plan = buildPersonalizedDietPlan(state);
    return {
      textOutput: buildPersonalizedDietPlanText(plan, null),
      htmlOutput: buildPersonalizedDietPlanHtml(plan, null),
      surveyCompleted: !!(plan && plan.state && plan.state.surveyCompleted)
    };
  }

  function buildDietEnergyRecommendationResult() {
    syncDietRecommendationControlsForAge();
    const baseResult = buildDietBaseRecommendationResultForReport();
    if (!baseResult) return null;
    const html = `
      <div class="diet-energy-output">
        <div class="diet-energy-output-head">
          <h3>Zindywidualizowane zalecenia żywieniowe</h3>
          <p>Poniżej zebrano najważniejsze zalecenia energetyczne, żywieniowe i aktywnościowe wynikające z danych pacjenta.</p>
        </div>
        <div class="diet-energy-output-body">${baseResult.htmlOutput || ''}</div>
      </div>`;
    return {
      textOutput: baseResult.textOutput || '',
      htmlOutput: html,
      surveyCompleted: false
    };
  }

  function updateDietCardLabels() {
    syncDietRecommendationControlsForAge();
    const patientFacing = isPatientFacingDietMode();
    const isAdult = getAgeDecimalInternal() >= ENERGY_ADULT_START_AGE;
    const noteEl = document.getElementById('dietInfoNote');
    const generateBtn = document.getElementById('generateDietBtn');
    const setText = function(id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    if (noteEl) {
      if (isAdult) {
        vildaAppSetTrustedHtml(noteEl, patientFacing
          ? 'W karcie <strong>Plan odchudzania</strong> ustaw deklarowany poziom aktywności i dietę tak, jak chcesz je przekazać osobie dorosłej w zaleceniach po wizycie.'
          : 'W karcie <strong>Plan odchudzania</strong> wybierz deklarowany poziom aktywności i rodzaj diety; zalecenia będą opisane w standardowym, neutralnym języku, a dla dorosłych domyślnie pozostaje włączona redukcja masy ciała.',
          'app:diet-info-note');
      } else {
        vildaAppSetTrustedHtml(noteEl, patientFacing
          ? 'W karcie <strong>Plan odchudzania</strong> ustaw deklarowany poziom aktywności i dietę tak, jak chcesz je opisać w zaleceniach dla pacjenta, albo pozostaw ustawienia rekomendowane.'
          : 'W karcie <strong>Plan odchudzania</strong> wybierz deklarowany poziom aktywności i rodzaj diety albo pozostaw ustawienia rekomendowane; zalecenia będą opisane w standardowym, neutralnym języku.',
          'app:diet-info-note');
      }
    }
    setText('reduceToggleLabel', 'Redukcja masy');
    setText('stabilizationToggleLabel', 'Stabilizacja masy');
    setText('growthEndedLabel', 'Wzrost zakończony');
    setText('patientFacingToggleLabel', patientFacing ? 'Dla pacjenta' : 'Standardowy');
    setText('dietAudienceHint', patientFacing ? 'Prostszy język dla pacjenta.' : 'Neutralny, standardowy język zaleceń.');
    setText('vitDSuppLabel', 'Wit. D');
    setText('hydrationLabel', 'Picie płynów');
    setText('journeyLabel', isAdult ? 'Czas do normy BMI' : 'Czas do normy masy');
    setText('nutritionNormsToggleLabel', 'Normy żywieniowe');
    if (generateBtn) {
      generateBtn.textContent = 'Generuj plan SMART';
    }
    const generateEnergyBtn = document.getElementById('generateEnergyDietBtn');
    if (generateEnergyBtn) {
      generateEnergyBtn.textContent = patientFacing ? 'Generuj zalecenia energetyczne dla pacjenta' : 'Generuj zalecenia energetyczne';
    }
    updateDietModernControlsState();
    updateDietSurveyAgeVisibility();
  }

  function buildDietRecommendationResult(mode) {
    const activeMode = mode || dietRecommendationsGetActiveMode();
    if (activeMode === 'energy') return buildDietEnergyRecommendationResult();
    return buildDietSmartRecommendationResult();
  }

  function renderDietRecommendationResult(resultDiv, result, mode) {
    if (!resultDiv || !result || !result.htmlOutput) return;
    const normalizedMode = mode === 'energy' ? 'energy' : 'smart';
    vildaAppSetTrustedHtml(resultDiv, result.htmlOutput, 'app:resultDiv');
    resultDiv.dataset.dietSurveySource = normalizedMode === 'energy' ? 'energy' : (result.surveyCompleted ? 'survey' : 'baseline');
    dietRecommendationsLastOutputs[normalizedMode] = {
      textOutput: result.textOutput || '',
      htmlOutput: result.htmlOutput || ''
    };
    dietRecommendationsToggleResultActions(normalizedMode, true);
  }

  function resetDietSurveyGeneratedRecommendations() {
    const resultDiv = document.getElementById('dietRecommendationsResult');
    if (!resultDiv || !vildaAppHasHtmlContent(resultDiv)) return;
    const hadSurveyGeneratedOutput = resultDiv.dataset.dietSurveySource === 'survey' || !!resultDiv.querySelector('.diet-personalized-badge--active');
    if (!hadSurveyGeneratedOutput) {
      refreshDietRecommendationsIfVisible();
      return;
    }
    const generateBtn = document.getElementById('generateDietBtn');
    const generateLabel = generateBtn && generateBtn.textContent ? generateBtn.textContent.trim() : 'Generuj zalecenia dietetyczne';
    vildaAppSetTrustedHtml(resultDiv, '<div class="diet-survey-reset-note" role="status">Ankieta została wyczyszczona. Zalecenia wygenerowane na podstawie ankiety zostały usunięte. Kliknij „' + dietRecommendationsEscapeHtml(generateLabel) + '”, aby utworzyć zalecenia od nowa bez danych z ankiety.</div>', 'app:resultDiv');
    resultDiv.dataset.dietSurveySource = 'cleared';
    dietRecommendationsLastOutputs.smart = null;
    dietRecommendationsToggleResultActions('smart', false);
  }

  function refreshDietRecommendationsIfVisible() {
    const content = document.getElementById('dietRecommendationsContent');
    if (!content || content.style.display === 'none') return;
    const activeMode = dietRecommendationsGetActiveMode();
    const resultDiv = activeMode === 'energy' ? document.getElementById('dietEnergyResult') : document.getElementById('dietRecommendationsResult');
    if (!resultDiv) return;
    if (vildaAppHasHtmlContent(resultDiv) && resultDiv.dataset.dietSurveySource !== 'cleared') {
      const result = buildDietRecommendationResult(activeMode);
      renderDietRecommendationResult(resultDiv, result, activeMode === 'energy' ? 'energy' : 'smart');
    }
  }

  /**
   * Upewnia się, że elementy przycisku „Zalecenia dietetyczne” i kontenera
   * na treść istnieją w drzewie DOM.  Jeżeli nie zostały zadeklarowane w
   * dokumencie HTML (lub zostały usunięte przez inne skrypty), ta funkcja
   * tworzy je dynamicznie i wstawia w sekcji metabolicznego podsumowania.
   * Elementy otrzymują podstawowe style spójne z innymi przyciskami.
   */
  function ensureDietRecommendationsElements() {
    const section = document.getElementById('metabolicSummarySection');
    if (!section) return;
    let btn = document.getElementById('dietRecommendationsBtn');
    let content = document.getElementById('dietRecommendationsContent');
    // Jeżeli przycisk nie istnieje, utwórz go i dodaj do sekcji
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'dietRecommendationsBtn';
      // Podstawowe style – zgodne z innym przyciskiem podsumowania
      btn.style.backgroundColor = '#ffffff';
      btn.style.color = '#000000';
      btn.style.padding = '0.6rem 1.2rem';
      btn.style.border = 'none';
      btn.style.borderRadius = '4px';
      btn.style.fontSize = '1rem';
      btn.style.fontWeight = '600';
      btn.style.cursor = 'pointer';
      btn.style.width = '100%';
      btn.style.marginTop = '0.6rem';
      btn.textContent = 'Zalecenia dietetyczne';
      btn.style.display = 'none';
      section.appendChild(btn);
      // Załącz obsługę kliknięcia do nowo utworzonego przycisku.
      // Sprawdź, czy handler nie został już przypisany (użyj atrybutu data), aby
      // uniknąć wielokrotnego dodawania identycznych listenerów.
      if (!btn.dataset.dietListenerAttached) {
        btn.addEventListener('click', handleDietButtonClick);
        btn.dataset.dietListenerAttached = 'true';
      }
    }
    // Jeżeli kontener nie istnieje, utwórz go i dodaj do sekcji
    if (!content) {
      content = document.createElement('div');
      content.id = 'dietRecommendationsContent';
      content.className = 'result-box';
      content.style.display = 'none';
      content.style.marginTop = '0.6rem';
      content.style.textAlign = 'left';
      // Zmniejsz czcionkę o połowę względem domyślnej .result-box (1.75rem ➔ 0.875rem)
      content.style.fontSize = '0.875rem';
      section.appendChild(content);
    } else {
      // Jeżeli kontener istnieje, upewnij się, że ma zmniejszony rozmiar czcionki
      content.style.fontSize = '0.875rem';
    }
    // Upewnij się, że istniejący przycisk ma przypisany handler kliknięcia.
    if (btn && !btn.dataset.dietListenerAttached) {
      btn.addEventListener('click', handleDietButtonClick);
      btn.dataset.dietListenerAttached = 'true';
    }
    // Upewnij się, że w panelu istnieje nowa ankieta personalizująca, przycisk raportu PDF oraz obsługa nowego układu.
    ensureDietPersonalizationSurveyUi(content);
    dietRecommendationsEnsurePdfButton(content);
    dietRecommendationsAttachModernUiHandlers();
    dietRecommendationsSetActiveMode(dietRecommendationsGetActiveMode());
    // Zwróć elementy w razie potrzeby
    return { btn, content };
  }

  /**
   * Lokalna funkcja wyświetlająca toast z potwierdzeniem kopiowania tekstu.
   * Jeśli globalna funkcja showMetabolicToast nie jest dostępna (np. zdefiniowana w index.html),
   * używamy tej funkcji jako fallback. Tworzy ona element div z komunikatem
   * „Dane zostały skopiowane do schowka.”, ustawia odpowiedni styl oraz
   * usuwa ten element po krótkim czasie. Dzięki temu użytkownik zawsze
   * otrzyma informację zwrotną po skopiowaniu zaleceń dietetycznych.
   */
  function showMetabolicToast() {
    // Jeśli istnieje globalna wersja funkcji, skorzystaj z niej jako preferowanej.
    if (typeof window !== 'undefined' && typeof window.showMetabolicToast === 'function') {
      try {
        window.showMetabolicToast();
        return;
      } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 10911 });
    }
  }
    }
    // Lokalna implementacja toastu
    const toast = document.createElement('div');
    toast.textContent = 'Dane zostały skopiowane do schowka.';
    toast.style.position = 'fixed';
    toast.style.bottom = '1rem';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = '#00838d';
    toast.style.color = 'white';
    toast.style.padding = '0.6rem 1.2rem';
    toast.style.borderRadius = '4px';
    toast.style.fontSize = '1rem';
    toast.style.zIndex = '9999';
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.remove();
    }, 2500);
  }

  /**
   * Handler kliknięcia przycisku „Zalecenia dietetyczne”.  Włącza
   * generowanie zaleceń, kopiowanie do schowka oraz wyświetlanie
   * komunikatu toast.  Przy ponownym kliknięciu ukrywa kartę.
   */
  function handleDietButtonClick(event) {
    updateDietCardLabels();
    // Jeśli dostępne jest zdarzenie kliknięcia (event), zatrzymaj propagację,
    // aby inne nasłuchujące funkcje (np. zdefiniowane w DOMContentLoaded)
    // nie wykonały się ponownie dla tego samego kliknięcia.  Dzięki temu
    // unikniemy podwójnego wywoływania logiki wyświetlania i kopiowania.
    if (event && typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    const content = document.getElementById('dietRecommendationsContent');
    // Przełącz widoczność karty zaleceń dietetycznych bez generowania zawartości.
    if (!content) return;
    // Znajdź kontenery na wyniki i oczyść je, gdy karta jest pokazywana lub ukrywana
    const resultDiv = document.getElementById('dietRecommendationsResult');
    const energyResultDiv = document.getElementById('dietEnergyResult');
    const clearOutputs = function() {
      if (resultDiv) vildaAppClearHtml(resultDiv);
      if (energyResultDiv) vildaAppClearHtml(energyResultDiv);
      dietRecommendationsLastOutputs.smart = null;
      dietRecommendationsLastOutputs.energy = null;
      dietRecommendationsToggleResultActions('smart', false);
      dietRecommendationsToggleResultActions('energy', false);
    };
    if (content.style.display !== 'none') {
      content.style.display = 'none';
      clearOutputs();
      return;
    } else {
      content.style.display = 'block';
      clearOutputs();
      dietRecommendationsSetActiveMode(dietRecommendationsGetActiveMode());
    }
  }

  /**
   * Kopiuje podany tekst do schowka z użyciem dostępnego API lub poprzez
   * tymczasowy textarea i polecenie execCommand("copy").  Zwraca obietnicę,
   * która spełnia się po zakończeniu operacji kopiowania lub natychmiast,
   * jeśli kopiowanie nie jest wspierane.
   * @param {string} text Tekst do skopiowania
   * @returns {Promise<void>}
   */
  function copyDietTextToClipboard(text) {
    return new Promise(function(resolve, reject) {
      // Najpierw spróbuj użyć nowoczesnego API schowka
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(function() {
          resolve();
        }).catch(function() {
          // Jeśli nowoczesne API zawiedzie, użyj metody fallback
          try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (successful) {
              resolve();
            } else {
              reject(new Error('Copy command failed'));
            }
          } catch (e) {
            reject(e);
          }
        });
      } else {
        // Stary sposób: użycie textarea i execCommand
        try {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          const successful = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (successful) {
            resolve();
          } else {
            reject(new Error('Copy command failed'));
          }
        } catch (e) {
          reject(e);
        }
      }
    });
  }

  /**
   * Oblicza przybliżoną wartość BMI odpowiadającą zadanemu centylowi z siatek Palczewskiej.
   * Ponieważ dane Palczewskiej nie udostępniają bezpośrednio BMI dla dowolnego centyla,
   * wykonujemy wyszukiwanie binarne na przedziale BMI 5–40, używając funkcji
   * bmiPercentileChildPal do wyznaczenia percentyla dla danej wartości BMI.  Dla
   * dzieci o BMI w zakresie 5–40 metoda znajduje przybliżone BMI, dla którego
   * percentile ≈ targetPercentile.  W przypadku błędu lub braku danych zwraca null.
   *
   * @param {string} sex 'M' dla chłopców, 'F' dla dziewcząt
   * @param {number} months Wiek w miesiącach
   * @param {number} targetPercentile Docelowy centyl (np. 85 lub 97)
   * @returns {number|null} Przybliżony BMI odpowiadający docelowemu centylowi lub null, gdy brak danych
   */
  function findBmiForPercentilePal(sex, months, targetPercentile) {
    // Sprawdź, czy pomocnicza funkcja bmiPercentileChildPal jest dostępna
    if (typeof bmiPercentileChildPal !== 'function') return null;
    // Domyślny zakres BMI dla dzieci (ekstremalnie szeroki, aby uwzględnić różne przypadki)
    let low = 5;
    let high = 40;
    let mid, perc;
    // Wykonaj ~20 iteracji wyszukiwania binarnego, aby zbliżyć się do docelowego centyla
    for (let i = 0; i < 20; i++) {
      mid = (low + high) / 2;
      try {
        perc = bmiPercentileChildPal(mid, sex, months);
      } catch (_) {
        return null;
      }
      if (perc == null || isNaN(perc)) {
        return null;
      }
      // Jeżeli percentile dla aktualnego BMI jest mniejszy niż cel, musimy zwiększyć BMI
      if (perc < targetPercentile) {
        low = mid;
      } else {
        // W przeciwnym razie zmniejszamy zakres od góry
        high = mid;
      }
    }
    return (low + high) / 2;
  }

  // Jeżeli funkcja copyToClipboard jest już zdefiniowana w globalnym zakresie,
  // zastąp ją naszą wersją korzystającą z nowoczesnego API schowka oraz fallbacku.
  // Dzięki temu wszystkie wywołania copyToClipboard w innych modułach będą
  // korzystać z copyDietTextToClipboard, a automatyczne kopiowanie będzie działać
  // spójnie w całej aplikacji.
  if (typeof window !== 'undefined') {
    try {
      window.copyToClipboard = copyDietTextToClipboard;
    } catch (e) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', e, { line: 11082 });
    }
  }
  }

  /**
   * Kontroluje widoczność przycisku „Zalecenia dietetyczne” w zależności od
   * wieku, trybu wyników (standardowy/profesjonalny) oraz obecności nadwagi
   * lub otyłości (BMI ≥25 u dorosłych, wskaźnik Cole’a >110% u dzieci).  Jeśli
   * warunki nie są spełnione, przycisk oraz kontener wyników są ukrywane.
   */
  function updateDietRecommendationsVisibility() {
    syncDietRecommendationControlsForAge();
    // Upewnij się, że elementy istnieją – mogą zostać usunięte lub nie być
    // zadeklarowane w HTML.  Funkcja ensureDietRecommendationsElements tworzy je w razie potrzeby.
    const elements = ensureDietRecommendationsElements() || {};
    const dietBtn = elements.btn || document.getElementById('dietRecommendationsBtn');
    const dietContent = elements.content || document.getElementById('dietRecommendationsContent');
    if (!dietBtn || !dietContent) return;
    // Domyślnie ukryj zarówno przycisk, jak i treść
    dietBtn.style.display = 'none';
    dietContent.style.display = 'none';
    // Określ tryb profesjonalny: z obiektu window, zmiennej globalnej lub localStorage
    let proMode = false;
    try {
      if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') {
        proMode = !!window.professionalMode;
      } else if (typeof professionalMode !== 'undefined') {
        proMode = !!professionalMode;
      } else {
        proMode = (readResultsModeStorage() === 'professional');
      }
    } catch (_) {
      proMode = false;
    }
    // Pobierz ustawienia widoczności dla przycisku zaleceń dietetycznych.
    let showDietSetting = true;
    try {
      const persistence = (typeof window !== 'undefined') ? window.VildaPersistence : null;
      const settings = persistence && typeof persistence.readPreferenceJSON === 'function'
        ? persistence.readPreferenceJSON('CARD_VISIBILITY', {})
        : {};
      showDietSetting = settings['dietRecommendationsBtn'] !== false;
    } catch (_) {
      showDietSetting = true;
    }
    const age = getAgeDecimalInternal();
    // Jeśli tryb profesjonalny jest wyłączony lub użytkownik wyłączył przycisk
    // „Zalecenia dietetyczne” w ustawieniach, nie pokazuj przycisku ani treści.
    if (!proMode || !showDietSetting) {
      return;
    }
    const weight = parseFloat(document.getElementById('weight')?.value) || 0;
    const height = parseFloat(document.getElementById('height')?.value) || 0;
    if (!(weight > 0 && height > 0)) return;
    if (age <= 5) return;
    const bmi = weight / Math.pow(height / 100, 2);
    let show = false;
    if (age >= ENERGY_ADULT_START_AGE) {
      // Nadwaga/otyłość u dorosłych: BMI ≥ 25
      if (bmi >= 25) show = true;
    } else {
      // Dla dzieci porównujemy bieżące BMI do progu nadwagi (85. centyl).
      // W zależności od wybranego źródła danych używamy LMS (WHO/OLAF) lub
      // danych Palczewskiej.  Dla OLAF < 3 lat również stosujemy Palczewską.
      const months = Math.round(age * 12);
      const sexVal = document.getElementById('sex')?.value || 'M';
      // Najpierw spróbuj ustalić, czy powinniśmy korzystać z danych Palczewskiej
      let usePalczewska = false;
      try {
        if (typeof bmiSource !== 'undefined' && (bmiSource === 'PALCZEWSKA' || (bmiSource === 'OLAF' && age < OLAF_DATA_MIN_AGE))) {
          usePalczewska = true;
        }
      } catch (_) {
        usePalczewska = false;
      }
      if (usePalczewska) {
        // Palczewska: wyznacz BMI odpowiadające 85. centylowi.  Najpierw użyj
        // algorytmu wyszukiwania binarnego, aby znaleźć BMI dla żądanego centyla.
        // Jeżeli wynik jest nieprawidłowy, spadnij do bezpośredniego odczytu z getPalCentile.
        let targetPalBmi = null;
        try {
          if (typeof findBmiForPercentilePal === 'function') {
            targetPalBmi = findBmiForPercentilePal(sexVal, months, 85);
          }
        } catch (_) {
          targetPalBmi = null;
        }
        if (targetPalBmi != null && !isNaN(targetPalBmi)) {
          if (bmi >= targetPalBmi) show = true;
        } else if (typeof getPalCentile === 'function') {
          try {
            const tmp = getPalCentile(sexVal, months, 85, 'BMI');
            if (tmp && !isNaN(tmp)) {
              if (bmi >= tmp) show = true;
            }
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 11178 });
    }
  }
        }
      } else {
        // WHO lub OLAF (5–19 lat): użyj LMS i z‑score Z85.
        if (typeof getLMS === 'function') {
          const lms = getLMS(sexVal, months);
          if (lms && Array.isArray(lms) && lms.length === 3) {
            let targetBmi85 = null;
            try {
              if (typeof toNormalBMITarget === 'function') {
                targetBmi85 = toNormalBMITarget(weight, height, age, sexVal);
              }
            } catch (_) {
              targetBmi85 = null;
            }
            if (targetBmi85 && !isNaN(targetBmi85)) {
              if (bmi >= targetBmi85) show = true;
            }
          }
        }
      }
    }
    // Dodatkowo weź pod uwagę wskaźnik WHR, jeśli jest dostępny
    const whrInfo = document.getElementById('whrInfo');
    if (whrInfo && whrInfo.style.display !== 'none') {
      if (whrInfo.classList.contains('whr-warning') || whrInfo.classList.contains('whr-danger')) {
        show = true;
      }
    }
    // Ustaw widoczność przycisku i zawartości w zależności od warunku show
    dietBtn.style.display = show ? 'block' : 'none';
    if (!show) {
      dietContent.style.display = 'none';
    } else {
      refreshDietRecommendationsIfVisible();
    }

  }

  function generateAdultDietRecommendations(options) {
    const opts = options || {};
    const age = Number.isFinite(Number(opts.age))
      ? Number(opts.age)
      : (Number.isFinite(Number(opts.ageYears)) ? Number(opts.ageYears) : 0);
    const sex = String(opts.sex || 'M').toUpperCase() === 'F' ? 'F' : 'M';
    const weight = Number(opts.weight) || 0;
    const height = Number(opts.height) || 0;
    const pal = Number(opts.pal) || 0;
    const chosenDiet = opts.chosenDiet || null;
    const dailyDeficit = Number(opts.dailyDeficit) || 0;
    const weeklyLoss = Number(opts.weeklyLoss) || 0;
    const patientFacing = !!opts.patientFacing;
    const journeyEnabled = !!opts.journeyEnabled;
    const includeNutritionNorms = !!opts.includeNutritionNorms;
    if (!(weight > 0 && height > 0)) {
      return { textOutput: '', htmlOutput: '' };
    }

    const bmi = weight / Math.pow(height / 100, 2);
    const assessment = (typeof patientReportGetAdultBmiAssessment === 'function')
      ? patientReportGetAdultBmiAssessment(bmi)
      : { state: bmi >= 30 ? 'obesity-1' : (bmi >= 25 ? 'overweight' : (bmi < ADULT_BMI.UNDER ? 'underweight' : 'normal')) };
    const deltaInfo = (typeof patientReportGetAdultBmiWeightDelta === 'function')
      ? patientReportGetAdultBmiWeightDelta(weight, height)
      : null;
    const bmiLabel = (typeof patientReportGetAdultBmiSummaryStatusLabel === 'function')
      ? patientReportGetAdultBmiSummaryStatusLabel(assessment.state)
      : '';
    const targetUpperWeight = deltaInfo && Number.isFinite(deltaInfo.upperWeight)
      ? deltaInfo.upperWeight
      : 24.9 * Math.pow(height / 100, 2);
    const targetLowerWeight = deltaInfo && Number.isFinite(deltaInfo.lowerWeight)
      ? deltaInfo.lowerWeight
      : ADULT_BMI.UNDER * Math.pow(height / 100, 2);
    const palLabel = getDietPalLabel(pal);
    const palPhrase = palLabel
      ? `${palLabel} (PAL ${formatDietRecommendationNumber(pal, 1)})`
      : `PAL ${formatDietRecommendationNumber(pal, 1)}`;
    const lines = [];
    const hasWhrRisk = hasAdultDietWhrRisk();
    const needsWeightReduction = ['overweight', 'obesity-1', 'obesity-2', 'obesity-3'].includes(String(assessment.state || ''));
    const upperNormal = String(assessment.state || '') === 'upper-normal';
    const underweight = String(assessment.state || '') === 'underweight';
    const severeObesity = String(assessment.state || '') === 'obesity-2' || String(assessment.state || '') === 'obesity-3';

    if (needsWeightReduction && deltaInfo) {
      if (patientFacing) {
        lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)}, co odpowiada ${bmiLabel}. Aby wrócić do zakresu prawidłowego BMI dla dorosłych, warto dążyć do redukcji masy ciała o ok. ${formatDietRecommendationKg(deltaInfo.kgAboveUpper)}; odpowiada to masie około ${formatDietRecommendationKg(targetUpperWeight)}.`);
      } else {
        lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)} (${bmiLabel}). Do uzyskania zakresu prawidłowego BMI dla dorosłych potrzebna byłaby redukcja masy ciała o ok. ${formatDietRecommendationKg(deltaInfo.kgAboveUpper)}; masa odpowiadająca BMI 24,9 wynosi ok. ${formatDietRecommendationKg(targetUpperWeight)}.`);
      }
    } else if (upperNormal && deltaInfo) {
      if (patientFacing) {
        lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)} i mieści się jeszcze w zakresie prawidłowym dla dorosłych, ale jest blisko jego górnej granicy. Do BMI 25 pozostaje ok. ${formatDietRecommendationKg(deltaInfo.kgToUpper)}.`);
      } else {
        lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)} i pozostaje w zakresie prawidłowym dla dorosłych, ale jest blisko jego górnej granicy. Do BMI 25 pozostaje ok. ${formatDietRecommendationKg(deltaInfo.kgToUpper)}.`);
      }
    } else if (underweight && deltaInfo) {
      if (patientFacing) {
        lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)}, co odpowiada niedowadze. Aby osiągnąć dolną granicę prawidłowego BMI dla dorosłych, warto dążyć do zwiększenia masy ciała o ok. ${formatDietRecommendationKg(deltaInfo.kgToLower)}; odpowiada to masie około ${formatDietRecommendationKg(targetLowerWeight)}.`);
      } else {
        lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)} (niedowaga). Do osiągnięcia dolnej granicy prawidłowego BMI dla dorosłych potrzebne byłoby zwiększenie masy ciała o ok. ${formatDietRecommendationKg(deltaInfo.kgToLower)}; masa odpowiadająca BMI 18,5 wynosi ok. ${formatDietRecommendationKg(targetLowerWeight)}.`);
      }
    } else if (hasWhrRisk) {
      if (patientFacing) {
        lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)} i mieści się w zakresie prawidłowym dla dorosłych, ale rozmieszczenie tkanki tłuszczowej sugeruje potrzebę zmniejszenia obwodu talii.`);
      } else {
        lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)} i mieści się w zakresie prawidłowym dla dorosłych, jednak WHR sugeruje potrzebę zmniejszenia obwodu talii.`);
      }
    } else {
      lines.push(`BMI wynosi ${formatDietRecommendationNumber(bmi, 1)} i mieści się w zakresie prawidłowym dla dorosłych.`);
    }

    if (chosenDiet && dailyDeficit > 0 && weeklyLoss > 0) {
      const intakeRounded = (chosenDiet && Number.isFinite(Number(chosenDiet.intake)))
        ? Math.round(Number(chosenDiet.intake) / 100) * 100
        : null;
      const intakePhrase = Number.isFinite(intakeRounded)
        ? `zalecana kaloryczność diety wynosi ok. ${formatDietRecommendationNumber(intakeRounded, 0)} kcal/dzień`
        : 'zalecana kaloryczność diety jest dostosowana do wybranego planu';
      if (patientFacing) {
        lines.push(`W proponowanym planie przyjęto ${getDietLevelPhrase(chosenDiet, 'acc')} oraz deklarowaną aktywność ${palPhrase}; ${intakePhrase}, co daje deficyt ok. ${formatDietRecommendationNumber(dailyDeficit, 0)} kcal na dobę i tempo zmiany masy ciała rzędu ok. ${formatDietRecommendationNumber(weeklyLoss, 1)} kg tygodniowo.`);
      } else {
        lines.push(`Plan zakłada ${getDietLevelPhrase(chosenDiet, 'acc')} oraz deklarowaną aktywność ${palPhrase}; ${intakePhrase}, co odpowiada deficytowi energetycznemu ok. ${formatDietRecommendationNumber(dailyDeficit, 0)} kcal/dobę i tempu redukcji ok. ${formatDietRecommendationNumber(weeklyLoss, 1)} kg/tydzień.`);
      }
    } else if (needsWeightReduction) {
      if (patientFacing) {
        lines.push('W praktyce warto rozpocząć od umiarkowanego deficytu energetycznego, zwykle rzędu 500–750 kcal na dobę, i dostosowywać go do tolerancji oraz efektów leczenia.');
      } else {
        lines.push('Punktem wyjścia może być umiarkowany deficyt energetyczny, zwykle rzędu 500–750 kcal/dobę, z dalszą modyfikacją zależnie od tolerancji i skuteczności planu.');
      }
    }

    if (includeNutritionNorms) {
      const nutritionNormLines = buildDietNutritionNormsLines({
        ageYears: age,
        ageMonthsOpt: 0,
        sex,
        weightKg: weight,
        heightCm: height,
        palUsed: pal,
        chosenDiet,
        patientFacing,
        isAdult: true
      });
      nutritionNormLines.forEach((line) => {
        lines.push(line);
      });
    }

    if (needsWeightReduction) {
      lines.push(patientFacing
        ? 'Proszę przyjąć jako pierwszy cel zmniejszenie masy ciała o 5–10% w ciągu 3–6 miesięcy; to bezpieczny i klinicznie istotny etap leczenia.'
        : 'Rekomendowany jest początkowy cel terapeutyczny: redukcja 5–10% wyjściowej masy ciała w ciągu 3–6 miesięcy.');
      lines.push(patientFacing
        ? 'Proszę planować 3–5 regularnych posiłków dziennie, zwiększyć udział warzyw, produktów pełnoziarnistych, nasion roślin strączkowych i chudych źródeł białka oraz ograniczyć słodkie napoje, alkohol, słodycze i żywność wysoko przetworzoną.'
        : 'Jadłospis warto oprzeć na warzywach, produktach pełnoziarnistych, roślinach strączkowych, chudych źródłach białka i tłuszczach roślinnych; należy ograniczyć słodkie napoje, alkohol, słodycze i żywność wysoko przetworzoną.');
      lines.push(patientFacing
        ? 'Proszę zaplanować co najmniej 150–300 minut umiarkowanej aktywności tygodniowo oraz 2–3 sesje ćwiczeń oporowych; pomocne będzie także zwiększenie liczby kroków i ograniczenie długiego siedzenia.'
        : 'Wskazana jest aktywność fizyczna przez co najmniej 150–300 minut tygodniowo oraz 2–3 sesje treningu oporowego, a także zwiększenie spontanicznej aktywności w ciągu dnia.');
      lines.push(patientFacing
        ? 'Proszę kontrolować masę ciała raz w tygodniu, obserwować obwód talii i notować sytuacje sprzyjające podjadaniu, aby łatwiej korygować codzienne nawyki.'
        : 'Zalecane jest monitorowanie masy ciała raz w tygodniu, obwodu talii oraz regularności posiłków, snu i epizodów podjadania.');
    } else if (upperNormal || hasWhrRisk) {
      lines.push(patientFacing
        ? 'Warto zadbać o to, aby masa ciała nie rosła dalej, a obwód talii stopniowo się zmniejszał; nawet niewielka poprawa nawyków może zmniejszyć ryzyko metaboliczne.'
        : 'Priorytetem powinno być niedopuszczenie do dalszego wzrostu masy ciała oraz stopniowe zmniejszanie obwodu talii.');
      lines.push(patientFacing
        ? 'Proszę planować regularne posiłki, zwiększyć udział warzyw, produktów pełnoziarnistych i białka o dobrej wartości odżywczej oraz ograniczyć słodkie napoje, alkohol i żywność wysoko przetworzoną.'
        : 'Warto uporządkować regularność posiłków, zwiększyć udział warzyw, produktów pełnoziarnistych i białka o dobrej wartości odżywczej oraz ograniczyć słodkie napoje, alkohol i żywność wysoko przetworzoną.');
      lines.push(patientFacing
        ? 'Proszę utrzymywać regularną aktywność fizyczną – najlepiej co najmniej 150 minut tygodniowo – oraz ograniczać długie okresy siedzenia.'
        : 'Wskazane jest utrzymywanie regularnej aktywności fizycznej – najlepiej co najmniej 150 minut tygodniowo – oraz ograniczanie długich okresów siedzenia.');
    } else if (underweight) {
      lines.push(patientFacing
        ? 'Proszę zadbać o 4–5 regularnych, odżywczych posiłków dziennie, zwiększyć udział produktów białkowych, pełnoziarnistych i zdrowych tłuszczów oraz obserwować tolerancję posiłków i apetyt.'
        : 'Warto zadbać o 4–5 regularnych, energetycznie i odżywczo gęstych posiłków dziennie oraz zwiększyć udział produktów białkowych, pełnoziarnistych i zdrowych tłuszczów.');
      lines.push(patientFacing
        ? 'Jeżeli niedobór masy ciała utrzymuje się lub narasta, proszę omówić to podczas konsultacji lekarskiej, zwłaszcza gdy towarzyszą mu osłabienie, spadek apetytu lub niezamierzona utrata masy.'
        : 'Niedowaga wymaga oceny przyczyn klinicznych, zwłaszcza przy niezamierzonej utracie masy ciała lub objawach towarzyszących.');
    }

    if (hasWhrRisk) {
      lines.push(patientFacing
        ? 'Dodatkowym celem powinno być zmniejszenie obwodu talii, ponieważ obecny rozkład tkanki tłuszczowej zwiększa ryzyko powikłań metabolicznych.'
        : 'Dodatkowym celem terapii powinno być zmniejszenie obwodu talii, ponieważ obecny rozkład tkanki tłuszczowej zwiększa ryzyko powikłań metabolicznych.');
    }

    if (journeyEnabled && deltaInfo && deltaInfo.kgAboveUpper > 0.049 && weeklyLoss > 0) {
      const weeksToNorm = Math.max(1, Math.ceil(deltaInfo.kgAboveUpper / weeklyLoss));
      const monthsToNorm = formatDietRecommendationNumber(weeksToNorm / 4.345, 1);
      lines.push(patientFacing
        ? `Przy utrzymaniu tego planu dojście do zakresu prawidłowego BMI można szacować na około ${weeksToNorm} tygodni (ok. ${monthsToNorm} mies.).`
        : `Przy utrzymaniu tych założeń czas dojścia do zakresu prawidłowego BMI można szacować na około ${weeksToNorm} tygodni (ok. ${monthsToNorm} mies.).`);
    }

    if (severeObesity) {
      lines.push(patientFacing
        ? 'Ze względu na stopień otyłości proszę omówić dalszy plan leczenia podczas konsultacji lekarskiej; może być potrzebna szersza ocena powikłań i bardziej intensywne postępowanie.'
        : 'Ze względu na stopień otyłości wskazana jest konsultacja lekarska w celu oceny powikłań i rozważenia bardziej intensywnego postępowania.');
    }

    let textOutput = '';
    let htmlOutput = '<ol>';
    lines.forEach((ln, idx) => {
      const prefix = (idx + 1) + '. ';
      textOutput += prefix + ln + '\n';
      htmlOutput += `<li>${ln}</li>`;
    });
    htmlOutput += '</ol>';
    const cleanedText = textOutput.trim().replace(/[\u00A0\u202F]/g, ' ');
    return { textOutput: cleanedText, htmlOutput };
  }

  /**
   * Generuje listę zaleceń dietetycznych (tekstową i HTML) na podstawie
   * aktualnych danych użytkownika.  Uwzględnia docelową wagę (24,9 BMI u
   * dorosłych, 110% mediany BMI u dzieci) oraz medianę BMI (50 centyl),
   * wybraną dietę i deklarowany poziom aktywności PAL.  Dla dzieci <10 lat dodaje
   * ostrzeżenie o konieczności konsultacji z lekarzem.
   * @returns {{textOutput: string, htmlOutput: string}}
   */
  function generateDietRecommendations() {
    const age = getAgeDecimalInternal();
    // W trybie profesjonalnym (wyniki PRO) nie pokazujemy komunikatów typu „skonsultuj/umów wizytę”
    // w generowanych zaleceniach – ta wersja jest przeznaczona dla lekarzy.
    const proMode = (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined')
      ? !!window.professionalMode
      : (typeof professionalMode !== 'undefined' ? !!professionalMode : false);
    // Przed wygenerowaniem zaleceń zaktualizuj możliwość wyboru stabilizacji masy ciała
    // Korzystamy z globalnej funkcji, ponieważ funkcja z DOMContentLoaded nie jest w tym zasięgu.
    if (typeof window.updateStabilizationEligibility === 'function') {
      try { window.updateStabilizationEligibility(); } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 11412 });
    }
  }
    }
    const weight = parseFloat(document.getElementById('weight')?.value) || 0;
    const height = parseFloat(document.getElementById('height')?.value) || 0;
    const sex = document.getElementById('sex')?.value || 'M';
    const palRaw = document.getElementById('palFactor')?.value;
    const pal = palRaw === '' || palRaw == null ? null : parseFloat(palRaw);
    const ageMonthsOpt = parseFloat(document.getElementById('ageMonths')?.value) || 0;
    const planState = energyBuildPlanReductionState({
      ageYears: age,
      ageMonthsOpt,
      sex,
      weightKg: weight,
      heightCm: height,
      palInput: pal,
      history: window.intakeHistory || null,
      intakeKcalPerDay: window.intakeEstimatedKcalPerDay || null,
      mountId: 'anorexiaTmpMount'
    });
    let diets = Array.isArray(planState.diets) ? planState.diets.slice() : [];
    const selectedKey = document.getElementById('dietLevel')?.value || null;
    // Odczytaj flagę suplementacji witaminy D.  Użytkownik może zdecydować, czy chce otrzymać zalecenia dotyczące wit. D.
    const vitDEl = document.getElementById('vitDSuppFlag');
    const vitDEnabled = vitDEl ? vitDEl.checked : false;
    // Odczytaj flagę nawadniania.  Użytkownik może zdecydować, czy chce otrzymać zalecenia dotyczące picia wody.
    const hydrationEl = document.getElementById('hydrationFlag');
    const hydrationEnabled = hydrationEl ? hydrationEl.checked : false;
    // Odczytaj flagę przykładów z czasem dojścia do normy BMI.  Użytkownik może włączyć dodatkową sekcję
    // pokazującą przewidywany czas osiągnięcia górnej granicy normy BMI oraz przykłady aktywności fizycznej.
    const journeyEl = document.getElementById('journeyFlag');
    const journeyEnabled = journeyEl ? journeyEl.checked : false;
    const nutritionNormsEl = document.getElementById('nutritionNormsFlag');
    const nutritionNormsEnabled = nutritionNormsEl ? nutritionNormsEl.checked : false;
    const patientFacing = isPatientFacingDietMode();
    const chosenDiet = diets.find(d => d.key === selectedKey) || null;
    if (planState.isInfantPlanUnavailable) {
      return { textOutput: '', htmlOutput: '' };
    }
    const weeklyLoss = (chosenDiet && chosenDiet.weeklyLoss > 0) ? chosenDiet.weeklyLoss : 0;
    const dailyDeficit = chosenDiet ? chosenDiet.deficit : 0;
    const lines = [];
    let warningText = '';
    if (age >= ENERGY_ADULT_START_AGE) {
      return generateAdultDietRecommendations({
        age,
        proMode,
        weight,
        height,
        sex,
        pal: planState.palUsed,
        chosenDiet,
        dailyDeficit,
        weeklyLoss,
        patientFacing,
        journeyEnabled,
        includeNutritionNorms: nutritionNormsEnabled
      });
    }
    {

      // Dzieci i młodzież (5–18 lat)
      // Rozróżnij, czy zalecenia kierowane są bezpośrednio do dziecka (≥11 lat) czy do rodziców (<11 lat)
      const toChild = age >= 11;
      // Odczytaj wybraną strategię (redukcja vs stabilizacja) oraz flagę zakończenia wzrostu.
      // Jeżeli nie znaleziono wyboru, domyślnie przyjmij strategię redukcji.
      // Odczytaj strategię z przełączników redukcji/stabilizacji i flagę zakończenia wzrostu
      const reduceToggleEl = document.getElementById('reduceToggle');
      const stabilizationToggleEl = document.getElementById('stabilizationToggle');
      let selectedStrategy;
      if (reduceToggleEl && reduceToggleEl.checked) {
        selectedStrategy = 'reduction';
      } else if (stabilizationToggleEl && stabilizationToggleEl.checked) {
        selectedStrategy = 'stabilization';
      } else {
        // Domyślna strategia, jeśli żaden przełącznik nie jest zaznaczony
        selectedStrategy = 'reduction';
      }
      const growthEndedFlagEl = document.getElementById('growthEndedFlag');
      const growthEnded = growthEndedFlagEl ? growthEndedFlagEl.checked : false;
      const currentWeight = weight;
      const currentHeightM = height / 100;
      // Oblicz BMI dziecka
      const bmiChild = currentWeight / (currentHeightM * currentHeightM);
      // Ustal wskaźnik Cole’a, jeżeli jest dostępny; w przeciwnym razie wylicz z mediany BMI
      let colePercent = null;
      let medianBMI = null;
      if (typeof window.colePercentValue === 'number' && isFinite(window.colePercentValue)) {
        colePercent = window.colePercentValue;
      } else if (typeof getLMS === 'function') {
        const months = Math.round(age * 12);
        const lms = getLMS(sex, months);
        if (lms && Array.isArray(lms) && lms.length > 1 && lms[1] > 0) {
          medianBMI = lms[1];
          colePercent = (bmiChild / medianBMI) * 100;
        }
      }
      // Oblicz docelowe wartości BMI odpowiadające 85. i 97. centylowi i ustal, czy dziecko ma nadwagę lub otyłość.
      let childOverweight = false;
      let childObese = false;
      let targetBMI85Child = null;
      let targetBMI97Child = null;
      {
        // Ustal źródło danych: Palczewska (lub OLAF < 3 lata) kontra LMS (WHO/OLAF).
        const monthsForTarget = Math.round(age * 12);
        const sexVal = sex;
        let usePalczewskaChild = false;
        try {
          if (typeof bmiSource !== 'undefined' && (bmiSource === 'PALCZEWSKA' || (bmiSource === 'OLAF' && age < OLAF_DATA_MIN_AGE))) {
            usePalczewskaChild = true;
          }
        } catch (_) {
          usePalczewskaChild = false;
        }
        if (usePalczewskaChild) {
          // Użyj danych Palczewskiej: pobierz docelowe wagi (WT) dla 85. i 97. centyla, a następnie
          // przelicz je na wartości BMI, dzieląc przez kwadrat aktualnego wzrostu dziecka.  Jeżeli
          // dane wagowe nie są dostępne, próbujemy odczytać bezpośrednio BMI z siatek lub oszacować
          // za pomocą wyszukiwania binarnego.  Wartości mogą pozostać null, jeśli wszystkie metody zawiodą.
          let weight85 = null;
          let weight97 = null;
          if (typeof getPalCentile === 'function') {
            try {
              weight85 = getPalCentile(sexVal, monthsForTarget, 85, 'WT');
              weight97 = getPalCentile(sexVal, monthsForTarget, 97, 'WT');
            } catch (_) {
              weight85 = null;
              weight97 = null;
            }
          }
          if (weight85 != null && !isNaN(weight85)) {
            targetBMI85Child = weight85 / (currentHeightM * currentHeightM);
          }
          if (weight97 != null && !isNaN(weight97)) {
            targetBMI97Child = weight97 / (currentHeightM * currentHeightM);
          }
          // Jeżeli nie udało się pobrać docelowych wag, spróbuj odczytać bezpośrednio BMI z siatek lub oszacować.
          if (targetBMI85Child == null || isNaN(targetBMI85Child)) {
            let bmi85 = null;
            try {
              if (typeof findBmiForPercentilePal === 'function') {
                bmi85 = findBmiForPercentilePal(sexVal, monthsForTarget, 85);
              }
            } catch (_) {
              bmi85 = null;
            }
            if (bmi85 != null && !isNaN(bmi85)) {
              targetBMI85Child = bmi85;
            } else if (typeof getPalCentile === 'function') {
              try {
                const tmp85 = getPalCentile(sexVal, monthsForTarget, 85, 'BMI');
                if (tmp85 != null && !isNaN(tmp85)) targetBMI85Child = tmp85;
              } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 11563 });
    }
  }
            }
          }
          if (targetBMI97Child == null || isNaN(targetBMI97Child)) {
            let bmi97 = null;
            try {
              if (typeof findBmiForPercentilePal === 'function') {
                bmi97 = findBmiForPercentilePal(sexVal, monthsForTarget, 97);
              }
            } catch (_) {
              bmi97 = null;
            }
            if (bmi97 != null && !isNaN(bmi97)) {
              targetBMI97Child = bmi97;
            } else if (typeof getPalCentile === 'function') {
              try {
                const tmp97 = getPalCentile(sexVal, monthsForTarget, 97, 'BMI');
                if (tmp97 != null && !isNaN(tmp97)) targetBMI97Child = tmp97;
              } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 11583 });
    }
  }
            }
          }
        } else {
          // WHO/OLAF: oblicz wartości 85. i 97. centyla na podstawie LMS i z‑score Z85/Z97
          if (typeof getLMS === 'function') {
            const lms2 = getLMS(sexVal, monthsForTarget);
            if (lms2 && Array.isArray(lms2) && lms2.length === 3) {
              const [L, M, S] = lms2;
              try {
                const z85Val = (typeof Z85 !== 'undefined') ? Z85 : 1.036;
                const z97Val = (typeof Z97 !== 'undefined') ? Z97 : 1.8808;
                targetBMI85Child = (L !== 0)
                  ? M * Math.pow(1 + L * S * z85Val, 1 / L)
                  : M * Math.exp(S * z85Val);
                targetBMI97Child = (L !== 0)
                  ? M * Math.pow(1 + L * S * z97Val, 1 / L)
                  : M * Math.exp(S * z97Val);
              } catch (_) {
                targetBMI85Child = null;
                targetBMI97Child = null;
              }
            }
          }
        }
      }
      if (bmiChild && !isNaN(bmiChild)) {
        if (targetBMI85Child != null && !isNaN(targetBMI85Child)) {
          childOverweight = bmiChild >= targetBMI85Child;
        }
        if (targetBMI97Child != null && !isNaN(targetBMI97Child)) {
          childObese = bmiChild >= targetBMI97Child;
        }
      }
      const childWeightIssueInstr = childObese ? 'otyłością' : 'nadwagą';
      const childWeightIssueAcc = childObese ? 'otyłość' : 'nadwagę';
      const childWeightIssueLoc = childObese ? 'otyłości' : 'nadwadze';
      // Wylicz docelową wagę odpowiadającą górnej granicy normy BMI (85. centyl) oraz wagę dla 50. centyla BMI.
      // W zależności od źródła danych (Palczewska vs LMS) stosujemy różne metody.
      let targetWeightNorm = null;
      let targetWeightMedian = null;
      // Oblicz docelową wartość BMI dla górnej granicy normy (85. centyl)
      let targetBMI85 = null;
      // Czy korzystamy z Palczewskiej (lub OLAF < 3 lata)?
      let usePalForTarget = false;
      try {
        if (typeof bmiSource !== 'undefined' && (bmiSource === 'PALCZEWSKA' || (bmiSource === 'OLAF' && age < OLAF_DATA_MIN_AGE))) {
          usePalForTarget = true;
        }
      } catch (_) {
        usePalForTarget = false;
      }
      if (usePalForTarget) {
        // Palczewska: docelową wagę w górnej granicy normy (85. centyl) oraz medianę (50. centyl)
        // obliczamy na podstawie wartości BMI dla odpowiednich centyli.  Nie korzystamy z wag
        // (WT) dla wieku, ponieważ mogą prowadzić do zaniżonych progów przy niestandardowym wzroście.
        // Ustal docelową wartość BMI dla górnej granicy normy.
        if (targetBMI85Child != null && !isNaN(targetBMI85Child)) {
          targetBMI85 = targetBMI85Child;
        } else {
          // W razie braku wcześniejszej wartości spróbuj obliczyć BMI 85. centyla.
          targetBMI85 = null;
          try {
            if (typeof findBmiForPercentilePal === 'function') {
              targetBMI85 = findBmiForPercentilePal(sex, Math.round(age * 12), 85);
            }
          } catch (_) {
            targetBMI85 = null;
          }
          if ((targetBMI85 == null || isNaN(targetBMI85)) && typeof getPalCentile === 'function') {
            try {
              const tmpBMI = getPalCentile(sex, Math.round(age * 12), 85, 'BMI');
              if (tmpBMI != null && !isNaN(tmpBMI)) targetBMI85 = tmpBMI;
            } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 11658 });
    }
  }
          }
        }
        // Spróbuj bezpośrednio pobrać wagi z siatek Palczewskiej dla 85. i 50. centyla.
        let weight85Val = null;
        let weight50Val = null;
        if (typeof getPalCentile === 'function') {
          try {
            weight85Val = getPalCentile(sex, Math.round(age * 12), 85, 'WT');
          } catch (_) {
            weight85Val = null;
          }
          try {
            weight50Val = getPalCentile(sex, Math.round(age * 12), 50, 'WT');
          } catch (_) {
            weight50Val = null;
          }
        }
        // Jeśli udało się odczytać wagę dla 85. centyla, użyj jej jako docelowej wagi normy.
        // W przeciwnym razie skorzystaj z wartości BMI (85. centyl) i przelicz ją na wagę.
        if (weight85Val != null && !isNaN(weight85Val)) {
          targetWeightNorm = weight85Val;
        } else if (targetBMI85 != null && !isNaN(targetBMI85)) {
          targetWeightNorm = targetBMI85 * currentHeightM * currentHeightM;
        }
        // Ustal medianę BMI (50. centyl) na podstawie siatek Palczewskiej lub wylicz jak w przypadku LMS.
        let medianBMICalc = null;
        // Priorytet: odczyt z tabeli Palczewskiej za pomocą findBmiForPercentilePal lub getPalCentile('BMI').
        try {
          if (typeof findBmiForPercentilePal === 'function') {
            medianBMICalc = findBmiForPercentilePal(sex, Math.round(age * 12), 50);
          }
        } catch (_) {
          medianBMICalc = null;
        }
        if ((medianBMICalc == null || isNaN(medianBMICalc)) && typeof getPalCentile === 'function') {
          try {
            const tmpMed = getPalCentile(sex, Math.round(age * 12), 50, 'BMI');
            if (tmpMed != null && !isNaN(tmpMed)) medianBMICalc = tmpMed;
          } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 11699 });
    }
  }
        }
        // Jeśli nie ma danych Palczewskiej, użyj medianBMI z LMS lub oblicz z colePercent.
        if (medianBMICalc == null || isNaN(medianBMICalc)) {
          if (typeof medianBMI === 'number' && !isNaN(medianBMI)) {
            medianBMICalc = medianBMI;
          } else if (colePercent && colePercent > 0) {
            medianBMICalc = (bmiChild * 100) / colePercent;
          }
        }
        // Jeśli udało się odczytać wagę 50. centyla (medianę), użyj jej bezpośrednio; w przeciwnym razie skorzystaj z BMI.
        if (weight50Val != null && !isNaN(weight50Val)) {
          targetWeightMedian = weight50Val;
        } else if (medianBMICalc != null && !isNaN(medianBMICalc)) {
          targetWeightMedian = medianBMICalc * currentHeightM * currentHeightM;
        }
      } else {
        // WHO/OLAF: użyj funkcji toNormalBMITarget (85. centyl na podstawie LMS) do obliczenia
        // docelowej wagi, a medianę BMI przelicz z LMS lub z colePercent tak jak dotychczas
        try {
          if (typeof toNormalBMITarget === 'function') {
            targetBMI85 = toNormalBMITarget(currentWeight, height, age, sex);
          }
        } catch (_) {
          targetBMI85 = null;
        }
        if (targetBMI85 != null && !isNaN(targetBMI85)) {
          targetWeightNorm = targetBMI85 * currentHeightM * currentHeightM;
        }
        // Oblicz medianę BMI przy użyciu LMS lub z kolePercent
        let medianBMICalc = null;
        if (typeof medianBMI === 'number' && !isNaN(medianBMI)) {
          medianBMICalc = medianBMI;
        } else if (colePercent && colePercent > 0) {
          medianBMICalc = (bmiChild * 100) / colePercent;
        }
        if (medianBMICalc != null && !isNaN(medianBMICalc)) {
          targetWeightMedian = medianBMICalc * currentHeightM * currentHeightM;
        }
      }
      // Jeśli udało się obliczyć obie docelowe wagi, podaj różnice i zalecenia.
      if (targetWeightNorm && targetWeightMedian && !isNaN(targetWeightNorm) && !isNaN(targetWeightMedian)) {
        const diffNorm = Math.max(0, currentWeight - targetWeightNorm);
        const diffMedian = Math.max(0, currentWeight - targetWeightMedian);
        if (toChild) {
          if (patientFacing) {
            if (selectedStrategy === 'stabilization') {
              lines.push(
                `Twoja obecna masa ciała wynosi ${currentWeight.toFixed(1).replace('.', ',')} kg. Na tym etapie najważniejsze jest utrzymanie jej możliwie blisko obecnej wartości, aby wraz z dalszym wzrastaniem BMI mogło się stopniowo obniżać. Górna granica normy dla Twojego wieku i wzrostu odpowiada masie ok. ${targetWeightNorm.toFixed(1).replace('.', ',')} kg. Przeciętna masa ciała dziecka w Twoim wieku i przy Twoim wzroście to ok. ${targetWeightMedian.toFixed(1).replace('.', ',')} kg, więc obecnie Twoja masa ciała jest o ${diffMedian.toFixed(1).replace('.', ',')} kg wyższa od średniej.`
              );
            } else {
              lines.push(
                `Twoja obecna masa ciała wynosi ${currentWeight.toFixed(1).replace('.', ',')} kg. Docelowo warto stopniowo zbliżać się do masy ciała ok. ${targetWeightNorm.toFixed(1).replace('.', ',')} kg, co oznacza potrzebę redukcji o ok. ${diffNorm.toFixed(1).replace('.', ',')} kg. Przeciętna masa ciała dziecka w Twoim wieku i przy Twoim wzroście to ok. ${targetWeightMedian.toFixed(1).replace('.', ',')} kg, więc obecnie Twoja masa ciała jest o ${diffMedian.toFixed(1).replace('.', ',')} kg wyższa od średniej.`
              );
            }
          } else if (selectedStrategy === 'stabilization') {
            lines.push(
              `Twoja obecna waga to ${currentWeight.toFixed(1).replace('.', ',')} kg. Przy obecnym wzroście górna granica normy dla Twojego wieku odpowiada wadze ok. ${targetWeightNorm.toFixed(1).replace('.', ',')} kg. Staraj się utrzymać obecną masę ciała podczas dalszego wzrastania – dzięki temu BMI będzie stopniowo się obniżać. Przeciętna waga dziecka w Twoim wieku i wzroście to ok. ${targetWeightMedian.toFixed(1).replace('.', ',')} kg, co oznacza, że Twoja waga jest o ${diffMedian.toFixed(1).replace('.', ',')} kg wyższa niż średnia.`
            );
          } else {
            lines.push(
              `Twoja obecna waga to ${currentWeight.toFixed(1).replace('.', ',')} kg. Aby osiągnąć wagę w górnej granicy normy dla Twojego wieku i wzrostu, Twoja waga powinna wynosić ok. ${targetWeightNorm.toFixed(1).replace('.', ',')} kg, czyli musisz zredukować wagę o około ${diffNorm.toFixed(1).replace('.', ',')} kg. Przeciętna waga dziecka w Twoim wieku i wzroście to ok. ${targetWeightMedian.toFixed(1).replace('.', ',')} kg, co oznacza, że Twoja waga jest o ${diffMedian.toFixed(1).replace('.', ',')} kg wyższa niż średnia.`
            );
          }
        } else {
          if (patientFacing) {
            if (selectedStrategy === 'stabilization') {
              lines.push(
                `Obecna masa ciała dziecka wynosi ${currentWeight.toFixed(1).replace('.', ',')} kg. Na tym etapie najważniejsze jest utrzymanie jej możliwie blisko obecnej wartości, aby wraz z dalszym wzrastaniem BMI mogło się stopniowo obniżać. Górna granica normy dla wieku i wzrostu odpowiada masie ok. ${targetWeightNorm.toFixed(1).replace('.', ',')} kg. Przeciętna masa ciała rówieśnika o takim wzroście i w tym wieku to ok. ${targetWeightMedian.toFixed(1).replace('.', ',')} kg, więc masa ciała dziecka jest obecnie o ${diffMedian.toFixed(1).replace('.', ',')} kg wyższa od średniej.`
              );
            } else {
              lines.push(
                `Obecna masa ciała dziecka wynosi ${currentWeight.toFixed(1).replace('.', ',')} kg. Docelowo warto stopniowo zbliżać się do masy ciała ok. ${targetWeightNorm.toFixed(1).replace('.', ',')} kg, co oznacza potrzebę redukcji o ok. ${diffNorm.toFixed(1).replace('.', ',')} kg. Przeciętna masa ciała rówieśnika o takim wzroście i w tym wieku to ok. ${targetWeightMedian.toFixed(1).replace('.', ',')} kg, więc masa ciała dziecka jest obecnie o ${diffMedian.toFixed(1).replace('.', ',')} kg wyższa od średniej.`
              );
            }
          } else if (selectedStrategy === 'stabilization') {
            lines.push(
              `Waga dziecka: ${currentWeight.toFixed(1).replace('.', ',')} kg. Przy obecnym wzroście górna granica normy dla wieku i wzrostu odpowiada masie ok. ${targetWeightNorm.toFixed(1).replace('.', ',')} kg. Na tym etapie celem jest utrzymanie obecnej masy ciała dziecka podczas dalszego wzrastania, aby BMI mogło stopniowo się obniżać. Przeciętna waga rówieśnika o takim wzroście i w tym wieku to ok. ${targetWeightMedian.toFixed(1).replace('.', ',')} kg, co oznacza, że masa ciała dziecka jest o ${diffMedian.toFixed(1).replace('.', ',')} kg wyższa niż średnia.`
            );
          } else {
            lines.push(
              `Waga dziecka: ${currentWeight.toFixed(1).replace('.', ',')} kg. Aby masa ciała znalazła się w górnej granicy normy dla wieku i wzrostu, masa ciała powinna wynosić ok. ${targetWeightNorm.toFixed(1).replace('.', ',')} kg (czyli około ${diffNorm.toFixed(1).replace('.', ',')} kg mniej). Przeciętna waga rówieśnika o takim wzroście i w tym wieku to ok. ${targetWeightMedian.toFixed(1).replace('.', ',')} kg, co oznacza, że masa ciała dziecka jest o ${diffMedian.toFixed(1).replace('.', ',')} kg wyższa niż średnia.`
            );
          }
        }
      } else {
        // Jeżeli nie można obliczyć docelowej wagi, podaj ogólną informację o normie
        if (toChild) {
          lines.push(patientFacing ? 'Masa ciała mieści się obecnie w granicach normy dla Twojego wieku.' : 'Twoja masa ciała mieści się w granicach normy dla Twojego wieku.');
        } else {
          lines.push(patientFacing ? 'Masa ciała dziecka mieści się obecnie w granicach normy dla jego wieku.' : 'Masa ciała dziecka mieści się w granicach normy dla jego wieku.');
        }
      }
      // Informacja o wzroście i jego wpływie na BMI
      const agd = (typeof window.advancedGrowthData !== 'undefined') ? window.advancedGrowthData : null;
      let remainingCm = null;
      let smallRemaining = false;
      if (agd && agd.targetHeight && !isNaN(agd.targetHeight)) {
        const rem = agd.targetHeight - height;
        // Jeżeli pozostało więcej niż 3 cm do docelowego wzrostu, pokazujemy prognozę.
        if (rem > 3) {
          remainingCm = rem;
        } else if (rem > 0) {
          // Jeżeli pozostało 3 cm lub mniej, uznajemy, że wzrost praktycznie się kończy.
          smallRemaining = true;
        }
      }
      // Informacja o wzroście i jego wpływie na BMI. Jeżeli zaznaczono, że wzrost już się zakończył
      // albo z prognozy wynika, że do końcowego wzrostu pozostało 3 cm lub mniej,
      // pomiń komunikaty o rośnięciu i wyświetl jednoznaczne zalecenia zależne od strategii.
      const growthEndedEffective = growthEnded || smallRemaining;
      if (growthEndedEffective) {
        if (toChild) {
          let msg;
          if (patientFacing) {
            if (growthEnded) {
              msg = 'Twój wzrost jest już zakończony, więc poprawa BMI będzie zależeć przede wszystkim od codziennych nawyków żywieniowych i regularnej aktywności fizycznej.';
            } else {
              msg = 'Twój wzrost jest już prawie zakończony (pozostało nie więcej niż 3 cm), więc dalsze rośnięcie będzie miało niewielki wpływ na BMI.';
            }
            if (selectedStrategy === 'reduction') {
              msg += ' Dlatego najważniejsza jest zdrowa, stopniowa poprawa masy ciała poprzez dietę i ruch.';
            } else {
              msg += ' Dlatego najważniejsze jest niedopuszczanie do dalszego przyrostu masy ciała i systematyczna poprawa codziennych nawyków.';
            }
          } else {
            if (growthEnded) {
              msg = 'Twój wzrost jest już zakończony – dalsze rośnięcie nie pomoże w obniżeniu BMI.';
            } else {
              msg = 'Twój wzrost prawie się zakończył (pozostało nie więcej niż 3 cm) – dalsze rośnięcie nie pomoże w obniżeniu BMI.';
            }
            if (selectedStrategy === 'reduction') {
              msg += ' Skup się na zdrowej i stopniowej redukcji masy ciała poprzez odpowiednią dietę i aktywność fizyczną.';
            } else {
              msg += ' Skup się na niedopuszczaniu do dalszego przyrostu masy ciała poprzez zdrową dietę i aktywność fizyczną.';
            }
          }
          lines.push(msg);
        } else {
          let msg;
          if (patientFacing) {
            if (growthEnded) {
              msg = 'Wzrost dziecka jest już zakończony, więc poprawa BMI będzie zależeć przede wszystkim od codziennych nawyków żywieniowych i regularnej aktywności fizycznej.';
            } else {
              msg = 'Wzrost dziecka jest już prawie zakończony (pozostało nie więcej niż 3 cm), więc dalsze rośnięcie będzie miało niewielki wpływ na BMI.';
            }
            if (selectedStrategy === 'reduction') {
              msg += ' Proszę skupić się na zdrowej, stopniowej poprawie masy ciała poprzez dietę i ruch.';
            } else {
              msg += ' Proszę przede wszystkim nie dopuszczać do dalszego przyrostu masy ciała dziecka i systematycznie wzmacniać zdrowe nawyki.';
            }
          } else {
            if (growthEnded) {
              msg = 'Wzrost dziecka jest już zakończony – dalsze rośnięcie nie pomoże w obniżeniu BMI.';
            } else {
              msg = 'Wzrost dziecka prawie się zakończył (pozostało nie więcej niż 3 cm) – dalsze rośnięcie nie pomoże w obniżeniu BMI.';
            }
            if (selectedStrategy === 'reduction') {
              msg += ' Wspólnie skupcie się na zdrowej i stopniowej redukcji masy ciała poprzez odpowiednią dietę i aktywność fizyczną.';
            } else {
              msg += ' Skupcie się na niedopuszczaniu do dalszego przyrostu masy ciała dziecka poprzez zdrową dietę i aktywność fizyczną.';
            }
          }
          lines.push(msg);
        }
      } else if (remainingCm !== null) {
        // Wyświetl prognozę, jeżeli dziecko ma jeszcze istotny zapas wzrostu (>3 cm)
        if (toChild) {
          let mphInfo = '';
          if (agd && agd.targetHeight && !isNaN(agd.targetHeight)) {
            mphInfo = ` (Twój docelowy wzrost na podstawie wzrostu rodziców to ok. ${agd.targetHeight.toFixed(1).replace('.', ',')} cm ±8,5 cm, więc ta prognoza jest tylko orientacyjna)`;
          }
          const growFrom = childObese ? 'otyłości' : 'nadwagi';
          if (patientFacing) {
            lines.push(
              `Dalszy wzrost może pomóc w poprawie BMI. Szacujemy, że możesz jeszcze urosnąć ok. ${remainingCm.toFixed(1).replace('.', ',')} cm${mphInfo}. Jeżeli uda się utrzymać masę ciała możliwie blisko obecnej wartości, BMI będzie stopniowo się obniżać i z czasem możesz „wyrosnąć” z ${growFrom}.`
            );
          } else {
            lines.push(
              `Pamiętaj, że ciągle rośniesz – prognozujemy, że możesz jeszcze urosnąć ok. ${remainingCm.toFixed(1).replace('.', ',')} cm${mphInfo}. Każdy dodatkowy centymetr wzrostu obniży Twoje BMI. Staraj się, by w tym czasie Twoja masa ciała rosła minimalnie – dzięki temu „wyrośniesz” z ${growFrom}.`
            );
          }
        } else {
          let mphInfo = '';
          if (agd && agd.targetHeight && !isNaN(agd.targetHeight)) {
            mphInfo = ` (docelowy wzrost na podstawie wzrostu rodziców to ok. ${agd.targetHeight.toFixed(1).replace('.', ',')} cm ±8,5 cm, więc ta prognoza jest przybliżona)`;
          }
          const growFrom = childObese ? 'otyłości' : 'nadwagi';
          if (patientFacing) {
            lines.push(
              `Dalszy wzrost dziecka może ułatwić poprawę BMI. Szacujemy, że dziecko może jeszcze urosnąć ok. ${remainingCm.toFixed(1).replace('.', ',')} cm${mphInfo}. Jeżeli masa ciała będzie rosła bardzo wolno lub pozostanie zbliżona do obecnej, BMI będzie stopniowo się obniżać i dziecko może z czasem „wyrosnąć” z ${growFrom}.`
            );
          } else {
            lines.push(
              `Dziecko wciąż rośnie – prognozujemy, że może jeszcze urosnąć ok. ${remainingCm.toFixed(1).replace('.', ',')} cm${mphInfo}. Jeżeli masa ciała dziecka będzie rosła minimalnie, BMI będzie spadać w miarę wzrostu – wówczas dziecko „wyrośnie” z ${growFrom}.`
            );
          }
        }
      } else {
        const growFromGeneral = childObese ? 'otyłości' : 'nadwagi';
        if (toChild) {
          lines.push(
            patientFacing
              ? `Dalszy wzrost będzie sprzyjał poprawie BMI. Staraj się, aby masa ciała rosła jak najwolniej lub pozostała zbliżona do obecnej – wtedy z czasem możesz „wyrosnąć” z ${growFromGeneral}.`
              : `Pamiętaj, że ciągle rośniesz, co oznacza, że każdy dodatkowy centymetr wzrostu obniży Twoje BMI. Staraj się, by w tym czasie Twoja masa ciała rosła minimalnie – dzięki temu „wyrośniesz” z ${growFromGeneral}.`
          );
        } else {
          lines.push(
            patientFacing
              ? `Dalszy wzrost dziecka będzie sprzyjał poprawie BMI. Proszę dążyć do tego, aby masa ciała rosła jak najwolniej lub pozostała zbliżona do obecnej – wtedy dziecko może z czasem „wyrosnąć” z ${growFromGeneral}.`
              : `Dziecko wciąż rośnie, co pomaga naturalnie obniżyć BMI. Należy zadbać, aby masa ciała dziecka rosła minimalnie – w ten sposób dziecko „wyrośnie” z ${growFromGeneral}.`
          );
        }
      }
      // Informacja o wybranej diecie i deficycie energetycznym
      if (chosenDiet) {
        const deficit = dailyDeficit || 0;
        const weekly = weeklyLoss || 0;
        const intake = chosenDiet.intake || null;
        const intakePart = (intake && !isNaN(intake))
          ? `około ${intake} kcal dziennie`
          : 'ilość energii dopasowaną do wieku, wzrostu, masy ciała i poziomu aktywności';
        if (toChild) {
          let msg;
          if (patientFacing) {
            msg = `W codziennym planie żywieniowym warto celować w podaż energii na poziomie ${intakePart}. Taki plan daje deficyt około ${deficit} kcal dziennie, co zwykle odpowiada spadkowi masy ciała o ok. ${weekly.toFixed(1).replace('.', ',')} kg tygodniowo. `;
            if (selectedStrategy === 'reduction') {
              msg += 'Najważniejsza jest zdrowa, stopniowa redukcja masy ciała.';
            } else {
              msg += 'Najważniejsze jest utrzymanie obecnej masy ciała i niedopuszczanie do jej dalszego szybkiego wzrostu.';
            }
          } else {
            msg = `Optymalna dieta dostosowana do Twojego wieku, wzrostu, masy ciała i poziomu aktywności dostarcza ${intakePart}. Deficyt kaloryczny przy wybraniu tej diety wynosi około ${deficit} kcal, co przekłada się na utratę ok. ${weekly.toFixed(1).replace('.', ',')} kg na tydzień. `;
            if (selectedStrategy === 'reduction') {
              msg += 'Priorytetem jest zdrowa i stopniowa redukcja masy ciała.';
            } else {
              msg += 'Priorytetem jest utrzymanie obecnej masy ciała i zapobieganie jej dalszemu szybkiemu wzrostowi.';
            }
          }
          lines.push(msg);
        } else {
          let msg;
          if (patientFacing) {
            msg = `Plan żywieniowy dziecka warto oprzeć na podaży energii rzędu ${intakePart}. Przy takim ustawieniu uzyskujemy deficyt około ${deficit} kcal dziennie, co zwykle odpowiada spadkowi masy ciała o ok. ${weekly.toFixed(1).replace('.', ',')} kg tygodniowo. `;
            if (selectedStrategy === 'reduction') {
              msg += 'Najważniejsza jest zdrowa, stopniowa poprawa masy ciała.';
            } else {
              msg += 'Najważniejsze jest utrzymanie obecnej masy ciała dziecka i niedopuszczanie do jej dalszego szybkiego wzrostu.';
            }
          } else {
            msg = `Optymalna dieta dla dziecka, uwzględniająca wiek, wzrost, masę ciała i deklarowany poziom aktywności, dostarcza ${intakePart}. Deficyt kaloryczny przy wyborze tej diety wynosi około ${deficit} kcal, co przekłada się na utratę ok. ${weekly.toFixed(1).replace('.', ',')} kg tygodniowo. `;
            if (selectedStrategy === 'reduction') {
              msg += 'Należy pamiętać, że celem jest przede wszystkim zdrowa i stopniowa redukcja masy ciała.';
            } else {
              msg += 'Należy pamiętać, że celem jest przede wszystkim utrzymanie obecnej masy ciała dziecka i zapobieganie jej dalszemu szybkiemu wzrostowi.';
            }
          }
          lines.push(msg);
        }
      }
      if (nutritionNormsEnabled) {
        const nutritionNormLines = buildDietNutritionNormsLines({
          ageYears: age,
          ageMonthsOpt,
          sex,
          weightKg: weight,
          heightCm: height,
          palUsed: planState.palUsed,
          chosenDiet,
          patientFacing,
          isAdult: false,
          toChild
        });
        nutritionNormLines.forEach((line) => {
          lines.push(line);
        });
      }
      // Szczegółowe zalecenia żywieniowe
      if (toChild) {
        lines.push(
          patientFacing
            ? 'Proszę jeść regularnie 4–5 mniejszych posiłków dziennie. W każdym posiłku warto uwzględnić warzywa lub owoce, najlepiej o mniejszej zawartości cukrów prostych. Zamiast białego pieczywa, słodkich płatków i słodyczy wybieraj pieczywo pełnoziarniste, kasze i inne produkty z pełnego ziarna. Częściej sięgaj po chude mięso, ryby, nabiał naturalny oraz potrawy gotowane, duszone lub pieczone. Ogranicz fast foody, słodkie napoje, bardzo tłuste potrawy, żółte sery i ciężkie sosy.'
            : 'Postaraj się jeść regularnie 4–5 niewielkich posiłków dziennie. W każdym posiłku znajdź miejsce na warzywa lub owoce (unikaj bardzo słodkich). Wybieraj pełnoziarniste pieczywo i kasze zamiast białego pieczywa i słodyczy. Jedz chude mięso lub ryby gotowane lub pieczone, a unikaj tłustych potraw, żółtego sera, makaronów z ciężkimi sosami, grzanek oraz fast‑foodów. Pij przede wszystkim wodę lub niesłodzone napoje, a unikaj słodkich napojów gazowanych.'
        );
      } else {
        lines.push(
          patientFacing
            ? 'Proszę zadbać, aby dziecko jadło regularnie 4–5 mniejszych posiłków dziennie w spokojnej atmosferze. W każdym posiłku warto uwzględnić warzywa lub owoce, najlepiej o mniejszej zawartości cukrów prostych. Zamiast białego pieczywa, słodyczy i słodkich płatków proszę wybierać pieczywo pełnoziarniste, kasze oraz inne produkty z pełnego ziarna. Warto częściej podawać chude mięso, ryby i potrawy gotowane, duszone lub pieczone, a ograniczać fast foody, słodkie napoje, żółte sery i ciężkie sosy.'
            : 'Proszę zadbać, aby dziecko jadło regularnie 4–5 zdrowych posiłków dziennie w spokojnej atmosferze. W każdym posiłku połowę talerza powinny stanowić warzywa lub owoce (unikaj bardzo słodkich). Wybieraj pełnoziarniste pieczywo i kasze zamiast białego pieczywa i słodyczy, podawaj chude mięso lub ryby gotowane lub pieczone zamiast smażonych. Unikaj makaronów z ciężkimi sosami, żółtego sera, grzanek oraz fast‑foodów. Nie podawaj słodkich napojów gazowanych – najlepiej dawaj dziecku wodę lub herbatki owocowe bez cukru.'
        );
      }
      // Zalecenia dotyczące aktywności fizycznej
      if (toChild) {
        // Nie proponuj tańca chłopcom; dla dziewczynek pozostaw taniec jako opcję.
        if (sex === 'M') {
          lines.push(
            patientFacing
              ? 'Proszę planować każdego dnia co najmniej 60 minut ruchu. Najlepiej wybierać aktywności, które sprawiają przyjemność – spacery, jazdę na rowerze, bieganie, pływanie lub gry zespołowe. Warto też ograniczyć czas spędzany przed telewizorem, komputerem i telefonem.'
              : 'Staraj się być aktywny fizycznie przynajmniej 60 minut każdego dnia. Wybierz takie formy ruchu, które sprawiają Ci radość – mogą to być spacery, jazda na rowerze, bieganie, pływanie lub gry zespołowe. Ogranicz czas spędzany przed telewizorem, komputerem i telefonem.'
          );
        } else {
          lines.push(
            patientFacing
              ? 'Proszę planować każdego dnia co najmniej 60 minut ruchu. Najlepiej wybierać aktywności, które sprawiają przyjemność – spacery, jazdę na rowerze, bieganie, pływanie, taniec lub gry zespołowe. Warto też ograniczyć czas spędzany przed telewizorem, komputerem i telefonem.'
              : 'Staraj się być aktywny fizycznie przynajmniej 60 minut każdego dnia. Wybierz takie formy ruchu, które sprawiają Ci radość – mogą to być spacery, jazda na rowerze, bieganie, pływanie, taniec lub gry zespołowe. Ogranicz czas spędzany przed telewizorem, komputerem i telefonem.'
          );
        }
      } else {
        lines.push(
          patientFacing
            ? 'Proszę zadbać, aby dziecko miało codziennie co najmniej 60 minut ruchu. Warto zachęcać do spacerów, jazdy na rowerze, biegania, pływania, zabaw na świeżym powietrzu i gier zespołowych oraz ograniczać czas przed telewizorem, komputerem i telefonem.'
            : 'Rodzice powinni zadbać o to, by dziecko każdego dnia było aktywne fizycznie przez co najmniej 60 minut. Dziecko powinno zachęcać się do różnorodnego ruchu – spacerów, jazdy na rowerze, biegania, pływania, zabaw na świeżym powietrzu czy gier zespołowych. Ograniczajcie czas spędzany przed telewizorem, komputerem i telefonem.'
        );
      }

      // Dodaj zalecenia dotyczące witaminy D dla dzieci z nadwagą lub otyłością
      if (childOverweight && vitDEnabled) {
        let vitMsg;
        if (toChild) {
          if (age < 11) {
            vitMsg = patientFacing
              ? `W związku z ${childWeightIssueInstr} warto pamiętać o suplementacji witaminy D. W wieku 5–10 lat standardowo zaleca się 600–1000 IU dziennie, a przy ${childWeightIssueLoc} zwykle 1200–2000 IU dziennie. Przy dawkach powyżej 4000 IU dziennie konieczne są badania stężenia 25(OH)D we krwi i konsultacja z lekarzem.`
              : `Ze względu na ${childWeightIssueAcc} zadbaj o odpowiednią suplementację witaminy D. W Twoim wieku (5–10 lat) standardowo zaleca się 600–1000 IU witaminy D dziennie; przy ${childWeightIssueLoc} dawkę zwiększa się do 1200–2000 IU dziennie. Przy dawkach powyżej 4000 IU dziennie zaleca się regularne badania stężenia 25(OH)D we krwi i konsultację z lekarzem.`;
          } else {
            vitMsg = patientFacing
              ? `W związku z ${childWeightIssueInstr} warto pamiętać o suplementacji witaminy D. W wieku 11–18 lat standardowa dawka to 1000–2000 IU dziennie, a przy ${childWeightIssueLoc} zwykle 2000–4000 IU dziennie. Przy dawkach powyżej 4000 IU dziennie konieczne jest monitorowanie stężenia 25(OH)D we krwi i konsultacja z lekarzem.`
              : `Ze względu na ${childWeightIssueAcc} zadbaj o odpowiednią suplementację witaminy D. W wieku 11–18 lat standardowa dawka to 1000–2000 IU dziennie; u młodzieży z ${childWeightIssueInstr} stosuje się 2000–4000 IU dziennie. Przy dawkach powyżej 4000 IU dziennie konieczne jest monitorowanie stężenia 25(OH)D we krwi i konsultacja z lekarzem.`;
          }
        } else {
          if (age < 11) {
            vitMsg = patientFacing
              ? `W związku z ${childWeightIssueInstr} warto uwzględnić u dziecka suplementację witaminy D. W wieku 5–10 lat standardowo zaleca się 600–1000 IU dziennie, a przy ${childWeightIssueLoc} zwykle 1200–2000 IU dziennie. Przy dawkach powyżej 4000 IU dziennie potrzebne są badania stężenia 25(OH)D we krwi i konsultacja z lekarzem.`
              : `Dla dziecka w wieku 5–10 lat standardowa dawka witaminy D wynosi 600–1000 IU dziennie; u dzieci z ${childWeightIssueInstr} dawkę można zwiększyć do 1200–2000 IU dziennie. Przy wyższych dawkach (powyżej 4000 IU dziennie) należy regularnie badać stężenie 25(OH)D we krwi i skonsultować się z lekarzem.`;
          } else {
            vitMsg = patientFacing
              ? `W związku z ${childWeightIssueInstr} warto uwzględnić u dziecka suplementację witaminy D. W wieku 11–18 lat standardowo zaleca się 1000–2000 IU dziennie, a przy ${childWeightIssueLoc} zwykle 2000–4000 IU dziennie. Przy dawkach powyżej 4000 IU dziennie trzeba kontrolować stężenie 25(OH)D we krwi i skonsultować się z lekarzem.`
              : `Dla nastolatków w wieku 11–18 lat typowa dawka witaminy D to 1000–2000 IU dziennie; u nastolatków z ${childWeightIssueInstr} stosuje się 2000–4000 IU dziennie. Przy dawkach powyżej 4000 IU dziennie należy kontrolować stężenie 25(OH)D we krwi i skonsultować się z lekarzem.`;
          }
        }
        lines.push(vitMsg);
      }

      // Dodaj zalecenia dotyczące nawadniania dla dzieci z nadwagą lub otyłością
      // Informacja pojawia się wyłącznie wtedy, gdy użytkownik wybrał opcję nawadniania.
      if (childOverweight && hydrationEnabled) {
        let normativeLiters;
        if (age < 4) {
          normativeLiters = 1.25;
        } else if (age < 7) {
          normativeLiters = 1.6;
        } else if (age < 10) {
          normativeLiters = 1.75;
        } else {
          normativeLiters = (sex === 'K') ? 2.0 : 2.5;
        }
        const weightLiters = weight * 0.03;
        const recLiters = Math.max(normativeLiters, weightLiters);
        let hydrationMsg;
        if (toChild) {
          const weightLitersStr = weightLiters.toFixed(1).replace('.', ',');
          const normativeLitersStr = normativeLiters.toFixed(2).replace('.', ',');
          const recLitersStr = recLiters.toFixed(1).replace('.', ',');
          hydrationMsg = patientFacing
            ? `Proszę pamiętać o regularnym piciu wody. Światowa Organizacja Zdrowia przyjmuje orientacyjnie około 30 ml płynów na każdy kilogram masy ciała, co przy Twojej masie daje ok. ${weightLitersStr} l dziennie. Polskie normy żywienia dla Twojego wieku i płci wskazują około ${normativeLitersStr} l dziennie. W praktyce warto dążyć do co najmniej ${recLitersStr} l niesłodzonych płynów każdego dnia.`
            : `Pamiętaj o odpowiednim nawodnieniu – Światowa Organizacja Zdrowia zaleca picie około 30 ml wody na każdy kilogram masy ciała (przy Twojej masie to ok. ${weightLitersStr} l dziennie). Zgodnie z polskimi normami żywienia dzieci w Twoim wieku i płci powinny wypijać około ${normativeLitersStr} l wody dziennie. Przy nadwadze lub otyłości staraj się wypijać co najmniej ${recLitersStr} l niesłodzonych płynów każdego dnia.`;
        } else {
          const weightLitersStr2 = weightLiters.toFixed(1).replace('.', ',');
          const normativeLitersStr2 = normativeLiters.toFixed(2).replace('.', ',');
          const recLitersStr2 = recLiters.toFixed(1).replace('.', ',');
          hydrationMsg = patientFacing
            ? `Proszę zadbać o regularne picie wody przez dziecko. Światowa Organizacja Zdrowia przyjmuje orientacyjnie około 30 ml płynów na każdy kilogram masy ciała, co przy obecnej masie daje ok. ${weightLitersStr2} l dziennie. Polskie normy żywienia dla dzieci w wieku ${Math.floor(age)} lat i płci ${sex === 'K' ? 'żeńskiej' : 'męskiej'} wskazują około ${normativeLitersStr2} l dziennie. W praktyce warto dążyć do co najmniej ${recLitersStr2} l niesłodzonych płynów każdego dnia.`
            : `Rodzice powinni zadbać o odpowiednie nawodnienie dziecka. Światowa Organizacja Zdrowia zaleca picie około 30 ml wody na każdy kilogram masy ciała – przy obecnej masie to ok. ${weightLitersStr2} l dziennie. Polskie normy żywienia dla dzieci w wieku ${Math.floor(age)} lat i płci ${sex === 'K' ? 'żeńskiej' : 'męskiej'} zalecają około ${normativeLitersStr2} l wody dziennie. W przypadku nadwagi lub otyłości dziecko powinno wypijać co najmniej ${recLitersStr2} l niesłodzonych napojów każdego dnia.`;
        }
        lines.push(hydrationMsg);
      }

      // Jeśli użytkownik zaznaczył opcję „Przykłady z czasem dojścia do prawidłowej wagi”,
      // pokaż dodatkową sekcję zależną od obranej strategii.  Przy redukcji podajemy
      // czas wynikający z wybranego deficytu i przykłady aktywności potrzebnej do
      // spalenia nadmiaru kalorii.  Przy stabilizacji szacujemy orientacyjny czas,
      // po którym przy utrzymaniu obecnej masy ciała i dalszym wzrastaniu BMI może
      // wrócić do górnej granicy normy.
      if (childOverweight && journeyEnabled) {
        if (selectedStrategy === 'stabilization') {
          const agdJourney = (typeof window.advancedGrowthData !== 'undefined') ? window.advancedGrowthData : null;
          const startAgeMonths = Math.round(age * 12);

          function projectStabilizationJourney() {
            let annualGrowthCm = null;
            let basedOnObservedGrowth = false;

            if (agdJourney && typeof agdJourney.growthVelocity === 'number' && isFinite(agdJourney.growthVelocity) && agdJourney.growthVelocity > 0) {
              annualGrowthCm = agdJourney.growthVelocity;
              basedOnObservedGrowth = true;
            }

            if ((!annualGrowthCm || !isFinite(annualGrowthCm) || annualGrowthCm <= 0) && typeof medianHeightForAgeMonths === 'function') {
              try {
                const medianHeightNow = medianHeightForAgeMonths(sex, startAgeMonths);
                const medianHeightInYear = medianHeightForAgeMonths(sex, Math.min(Math.round(CHILD_AGE_MAX * 12), startAgeMonths + 12));
                if (isFinite(medianHeightNow) && isFinite(medianHeightInYear) && medianHeightInYear > medianHeightNow) {
                  annualGrowthCm = medianHeightInYear - medianHeightNow;
                }
              } catch (_) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', _, { line: 12104 });
    }
  }
            }

            if (!annualGrowthCm || !isFinite(annualGrowthCm) || annualGrowthCm <= 0) {
              if (age < 5) annualGrowthCm = 6.0;
              else if (age < 10) annualGrowthCm = 5.5;
              else if (age < 13) annualGrowthCm = 6.5;
              else if (age < 15) annualGrowthCm = 5.0;
              else if (age < 17) annualGrowthCm = 3.5;
              else annualGrowthCm = 2.0;
            }

            const monthlyGrowthCm = annualGrowthCm / 12;
            const maxMonths = Math.max(1, Math.ceil(Math.max(0, (CHILD_AGE_MAX - age) * 12)));
            const targetHeightCap = (agdJourney && typeof agdJourney.targetHeight === 'number' && isFinite(agdJourney.targetHeight) && agdJourney.targetHeight > height)
              ? agdJourney.targetHeight
              : null;

            function projectedHeightAfterMonths(monthOffset) {
              let projectedHeight = height + (monthlyGrowthCm * monthOffset);
              if (targetHeightCap != null) {
                projectedHeight = Math.min(projectedHeight, targetHeightCap);
              }
              return projectedHeight;
            }

            function projectedBmiAfterMonths(monthOffset) {
              const projectedHeight = projectedHeightAfterMonths(monthOffset);
              if (!isFinite(projectedHeight) || projectedHeight <= 0) return null;
              return currentWeight / Math.pow(projectedHeight / 100, 2);
            }

            let normalizationMonth = null;
            for (let month = 1; month <= maxMonths; month++) {
              const projectedHeight = projectedHeightAfterMonths(month);
              const projectedAge = age + (month / 12);
              let targetBmiProjected = null;
              try {
                targetBmiProjected = toNormalBMITarget(currentWeight, projectedHeight, projectedAge, sex);
              } catch (_) {
                targetBmiProjected = null;
              }
              const projectedBmi = projectedBmiAfterMonths(month);
              if (isFinite(targetBmiProjected) && isFinite(projectedBmi) && projectedBmi <= targetBmiProjected) {
                normalizationMonth = month;
                break;
              }
            }

            if (normalizationMonth == null) {
              return null;
            }

            let milestoneMonths = [normalizationMonth];
            if (normalizationMonth > 6) {
              milestoneMonths = [3, 6, normalizationMonth];
            } else if (normalizationMonth > 3) {
              milestoneMonths = [3, normalizationMonth];
            }
            milestoneMonths = Array.from(new Set(milestoneMonths)).filter(m => m > 0);

            const milestones = milestoneMonths.map(monthOffset => {
              const projectedHeight = projectedHeightAfterMonths(monthOffset);
              const projectedBmi = projectedBmiAfterMonths(monthOffset);
              return {
                monthOffset,
                projectedHeight,
                projectedBmi
              };
            }).filter(item => isFinite(item.projectedHeight) && isFinite(item.projectedBmi));

            return {
              normalizationMonth,
              weeksToNormalize: Math.ceil(normalizationMonth * 4.345),
              monthsToNormalizeLabel: String(normalizationMonth).replace('.', ','),
              annualGrowthCmLabel: annualGrowthCm.toFixed(1).replace('.', ','),
              basedOnObservedGrowth,
              milestones
            };
          }

          const stabilizationJourney = projectStabilizationJourney();
          if (stabilizationJourney) {
            const milestoneDescriptions = stabilizationJourney.milestones.map(item => {
              const monthLabel = item.monthOffset.toFixed(0).replace('.', ',');
              const heightLabel = item.projectedHeight.toFixed(1).replace('.', ',');
              const bmiLabel = item.projectedBmi.toFixed(1).replace('.', ',');
              if (item.monthOffset === stabilizationJourney.normalizationMonth) {
                return `za ${monthLabel} mies. przy wzroście ok. ${heightLabel} cm BMI może wejść w górną granicę normy (ok. ${bmiLabel})`;
              }
              return `za ${monthLabel} mies. przy wzroście ok. ${heightLabel} cm BMI może wynosić ok. ${bmiLabel}`;
            }).join('; ');
            const growthBasis = stabilizationJourney.basedOnObservedGrowth
              ? `w tempie około ${stabilizationJourney.annualGrowthCmLabel} cm/rok`
              : `w orientacyjnym tempie około ${stabilizationJourney.annualGrowthCmLabel} cm/rok`;

            if (toChild) {
              lines.push(
                patientFacing
                  ? `Przy utrzymaniu obecnej masy ciała i dalszym wzrastaniu ${growthBasis} dojście do górnej granicy normy BMI może zająć około ${stabilizationJourney.weeksToNormalize} tygodni (ok. ${stabilizationJourney.monthsToNormalizeLabel} mies.). Przykładowy przebieg: ${milestoneDescriptions}.`
                  : `Jeśli utrzymasz obecną masę ciała i będziesz dalej rosnąć ${growthBasis}, dojście do górnej granicy normy BMI może zająć około ${stabilizationJourney.weeksToNormalize} tygodni (ok. ${stabilizationJourney.monthsToNormalizeLabel} mies.). Przykładowy przebieg: ${milestoneDescriptions}.`
              );
            } else {
              lines.push(
                patientFacing
                  ? `Jeżeli uda się utrzymać masę ciała dziecka na poziomie zbliżonym do obecnego, a dziecko będzie dalej rosnąć ${growthBasis}, dojście do górnej granicy normy BMI może zająć około ${stabilizationJourney.weeksToNormalize} tygodni (ok. ${stabilizationJourney.monthsToNormalizeLabel} mies.). Przykładowy przebieg: ${milestoneDescriptions}.`
                  : `Jeżeli masa ciała dziecka pozostanie zbliżona do obecnej, a dziecko będzie dalej rosnąć ${growthBasis}, dojście do górnej granicy normy BMI może zająć około ${stabilizationJourney.weeksToNormalize} tygodni (ok. ${stabilizationJourney.monthsToNormalizeLabel} mies.). Przykładowy przebieg: ${milestoneDescriptions}.`
              );
            }
          }
        } else {
          // Ustal ile kilogramów należy zredukować, aby osiągnąć górną granicę normy BMI.
          let kgToLoseJourney = 0;
          if (targetWeightNorm != null && !isNaN(targetWeightNorm)) {
            kgToLoseJourney = Math.max(0, currentWeight - targetWeightNorm);
          }
          // Jeżeli jest co redukować i tempo utraty jest dodatnie, oblicz czas.
          if (kgToLoseJourney > 0 && weeklyLoss > 0) {
            const weeksJourney = Math.ceil(kgToLoseJourney / weeklyLoss);
            // Format months value with comma as decimal separator
            const monthsJourney = (weeksJourney / 4.345).toFixed(1).replace('.', ',');
            // Oblicz całkowitą liczbę kalorii do spalenia
            const kcalPerKg = (typeof KCAL_PER_KG === 'number') ? KCAL_PER_KG : 7700;
            const kcalToBurnJourney = kgToLoseJourney * kcalPerKg;
            // Funkcja formatująca czas w godzinach i minutach
            function formatTime(min) {
              const h = Math.floor(min / 60);
              const m = Math.round(min % 60);
              return h > 0 ? `${h} h ${m} min` : `${m} min`;
            }
            // Zdefiniuj aktywności w zależności od płci
            const acts = (sex === 'M')
              ? [
                  { name: 'bieganie', met: 8.0, match: false },
                  { name: 'rower',   met: 6.0, match: false },
                  { name: 'piłka nożna', met: 7.0, match: true }
                ]
              : [
                  { name: 'pływanie', met: 7.5, match: false },
                  { name: 'taniec',   met: 5.0, match: false },
                  { name: 'rower',    met: 6.0, match: false }
                ];
            // Oblicz opis dla każdej aktywności
            const activityDescriptions = acts.map(act => {
              const burnPerMin = (act.met * 3.5 * currentWeight) / 200;
              const totalMin = (burnPerMin > 0) ? (kcalToBurnJourney / burnPerMin) : 0;
              // Jeśli to piłka nożna – przelicz na mecze (90 minut)
              if (act.match) {
                const matches = totalMin / 90;
                const matchesRounded = Math.ceil(matches);
                return `${act.name.charAt(0).toUpperCase() + act.name.slice(1)} – około ${matchesRounded} meczów`;
              } else {
                return `${act.name.charAt(0).toUpperCase() + act.name.slice(1)} – około ${formatTime(totalMin)}`;
              }
            }).join(', ');
            // Sformułuj komunikat zależny od odbiorcy
            if (toChild) {
              lines.push(
                patientFacing
                  ? `Przy obecnych założeniach żywieniowych i utrzymaniu zadeklarowanej aktywności dojście do górnej granicy normy BMI może zająć około ${weeksJourney} tygodni (ok. ${monthsJourney} miesiąca/miesięcy). Poniższe aktywności pokazują orientacyjnie, ile czasu zajęłoby spalenie całego nadmiaru kalorii: ${activityDescriptions}. To tylko przykład teoretyczny — w praktyce połączenie diety i ruchu daje najlepsze efekty.`
                  : `Stosując wybraną dietę i utrzymując zadeklarowany poziom aktywności, dojście do górnej granicy normy BMI zajmie Ci około ${weeksJourney} tygodni (ok. ${monthsJourney} miesiąca/miesięcy). Poniższe aktywności są jedynie przykładem, ile czasu teoretycznie trwałoby spalenie całego nadmiaru kalorii: ${activityDescriptions}. Taki czas może wydawać się długi, bo zakłada wyłącznie spalanie kalorii przez ruch. W połączeniu z dietą proces redukcji zachodzi szybciej i przynosi lepsze efekty, więc łączenie zdrowej aktywności i odpowiedniego odżywiania jest najskuteczniejsze.`
              );
            } else {
              lines.push(
                patientFacing
                  ? `Przy obecnych założeniach żywieniowych i utrzymaniu zadeklarowanej aktywności dojście dziecka do górnej granicy normy BMI może zająć około ${weeksJourney} tygodni (ok. ${monthsJourney} miesiąca/miesięcy). Poniższe aktywności pokazują orientacyjnie, ile czasu zajęłoby spalenie całego nadmiaru kalorii: ${activityDescriptions}. To tylko przykład teoretyczny — w praktyce połączenie diety i ruchu daje najlepsze efekty.`
                  : `Przy wybranej diecie i zadeklarowanym poziomie aktywności dziecko osiągnie górną granicę normy BMI w ciągu około ${weeksJourney} tygodni (ok. ${monthsJourney} miesiąca/miesięcy). Poniższe aktywności to przykładowe wyliczenia pokazujące, ile czasu teoretycznie trwałoby spalenie całego nadmiaru kalorii: ${activityDescriptions}. Taki szacowany czas może wydawać się długi, bo uwzględnia jedynie spalanie kalorii podczas ruchu. W praktyce dieta znacząco redukuje nadmiar kalorii, dlatego połączenie zdrowego odżywiania z aktywnością fizyczną daje najlepsze i najszybsze rezultaty.`
              );
            }
          }
        }
      }
      // Informacja o konieczności konsultacji specjalistycznych
      let needSpecialist = false;
      if (age < 10 || (colePercent && colePercent >= 120) || (chosenDiet && chosenDiet.key === 'intense')) {
        needSpecialist = true;
      }
      if (needSpecialist && !proMode) {
        if (toChild) {
          lines.push(
            patientFacing
              ? 'Jeżeli wdrożenie zaleceń okaże się trudne, porozmawiaj z rodzicami o konsultacji z dietetykiem lub psychologiem dziecięcym. W razie potrzeby warto rozważyć również wsparcie trenera personalnego.'
              : 'Jeżeli masz trudności z trzymaniem się zasad żywienia lub z regularną aktywnością fizyczną, porozmawiaj z rodzicami o konsultacji z dietetykiem lub psychologiem dziecięcym. W razie potrzeby warto skorzystać również z pomocy trenera personalnego.'
          );
        } else {
          lines.push(
            patientFacing
              ? 'Jeżeli utrzymanie zaleceń będzie trudne, proszę rozważyć konsultację z dietetykiem lub psychologiem dziecięcym, a w razie potrzeby także z trenerem personalnym, aby wspólnie ustalić realny plan żywieniowy i ruchowy.'
              : 'W razie trudności z utrzymaniem zaleceń dietetycznych lub aktywności fizycznej skonsultujcie się z dietetykiem lub psychologiem dziecięcym, a w miarę potrzeby także z trenerem personalnym, aby ustalić indywidualny plan żywieniowy i ruchowy oraz uzyskać wsparcie.'
          );
        }
      }
      // Ostrzeżenie dla dzieci poniżej 10 lat
      if (age < 10 && !proMode) {
        warningText = patientFacing
          ? 'U dziecka poniżej 10. roku życia taki plan należy traktować wyłącznie orientacyjnie; wskazana jest konsultacja z dietetykiem lub endokrynologiem dziecięcym.'
          : 'Dziecko poniżej 10 lat z nadwagą lub otyłością powinno skonsultować się z dietetykiem lub endokrynologiem dziecięcym. Proponowany plan ma charakter poglądowy.';
      }
    }
    let textOutput = '';
    let htmlOutput = '';
    if (warningText) {
      textOutput += warningText + '\n';
      htmlOutput += `<div class="plan-warning-card notice-orange" style="margin-bottom:0.6rem;">${warningText}</div>`;
    }
    htmlOutput += '<ol>';
    lines.forEach((ln, idx) => {
      const prefix = (idx + 1) + '. ';
      textOutput += prefix + ln + '\n';
      htmlOutput += `<li>${ln}</li>`;
    });
    htmlOutput += '</ol>';
    // Usuń twarde spacje (NBSP) oraz wąskie spacje nierozdzielające (\u202F) z tekstu,
    // aby w schowku były zwykłe spacje. Dotyczy to też innych wariantów spacji nierozdzielających.
    const cleanedText = textOutput
      .trim()
      .replace(/[\u00A0\u202F]/g, ' ');
    return { textOutput: cleanedText, htmlOutput };
  }

  /**
   * Generuje zalecenia dietetyczne nastawione na stabilizację masy ciała.
   * Tymczasowo usuwa wybraną dietę redukcyjną, aby uniknąć wstawiania
   * informacji o deficycie kalorycznym oraz utracie masy ciała, a następnie
   * filtruje linie zawierające wzmianki o deficycie, utracie wagi czy szybkim
   * chudnięciu.  Funkcja zwraca obiekt z kluczami textOutput oraz htmlOutput
   * analogicznie do generateDietRecommendations().
   * @returns {{textOutput: string, htmlOutput: string}|null}
   */
  function generateDietRecommendationsStabilization() {
    const dietSelect = document.getElementById('dietLevel');
    let originalValue = null;
    // Zachowaj oryginalny wybór i ustaw pustą wartość, aby nie wybierać diety redukcyjnej
    if (dietSelect) {
      originalValue = dietSelect.value;
      dietSelect.value = '';
    }
    // Wygeneruj pełne zalecenia
    const result = generateDietRecommendations();
    // Przywróć oryginalny wybór diety
    if (dietSelect && originalValue !== null) {
      dietSelect.value = originalValue;
    }
    if (!result) return null;
    // Odczytaj ostrzeżenie (ramka) z wyniku i pozostaw je przed listą.
    let warningHtml = '';
    let listHtmlStartIndex = 0;
    const htmlOut = result.htmlOutput || '';
    // Sprawdź, czy htmlOutput zaczyna się od karty ostrzegawczej
    if (htmlOut.startsWith('<div')) {
      const endDiv = htmlOut.indexOf('</div>');
      if (endDiv >= 0) {
        warningHtml = htmlOut.substring(0, endDiv + 6);
        listHtmlStartIndex = endDiv + 6;
      }
    }
    // Pobierz pozostałą część html (zawierającą <ol>)
    const remainingHtml = htmlOut.substring(listHtmlStartIndex);
    // Odczytaj tekstowe linie i odseparuj ewentualne ostrzeżenie z pierwszej linii.
    const allLines = result.textOutput.split('\n');
    let warningLine = '';
    if (allLines.length > 0) {
      const firstLineLc = allLines[0].toLowerCase();
      if (firstLineLc.includes('dziecko poniżej') || firstLineLc.includes('u dziecka poniżej')) {
        warningLine = allLines.shift();
      }
    }
    // Filtruj linie zawierające wzmianki o deficycie, utracie wagi czy szybkim chudnięciu
    const filteredLines = allLines.filter(function(line) {
      const lc = line.toLowerCase();
      return !(lc.includes('deficyt') || lc.includes('utrata') || lc.includes('chudn'));
    });
    // Zbuduj przefiltrowany tekst z renumeracją punktów oraz zachowaniem ostrzeżenia
    const outLines = [];
    if (warningLine) {
      outLines.push(warningLine);
    }
    let counter = 1;
    filteredLines.forEach(function(line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      const cleanLine = trimmed.replace(/^\d+\.\s*/, '');
      outLines.push(counter + '. ' + cleanLine);
      counter++;
    });
    const filteredText = outLines.join('\n');
    // Zbuduj przefiltrowaną listę HTML z ostrzeżeniem (jeśli istnieje) oraz listą
    let filteredHtml = '';
    if (warningHtml) {
      filteredHtml += warningHtml;
    }
    filteredHtml += '<ol>';
    filteredLines.forEach(function(line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      const liText = trimmed.replace(/^\d+\.\s*/, '');
      filteredHtml += '<li>' + liText + '</li>';
    });
    filteredHtml += '</ol>';
    return { textOutput: filteredText, htmlOutput: filteredHtml };
  }

  // Dodaj obsługę zdarzeń po załadowaniu DOM
  window.vildaAppOnReady('app:diet-recommendations-actions', function initDietRecommendationsActions() {
    // Upewnij się, że elementy przycisku, kontenera i przełączników istnieją.
    const elems = ensureDietRecommendationsElements() || {};
    // Do obsługi przycisku „Zalecenia dietetyczne” używamy handleDietButtonClick,
    // który został przypisany w ensureDietRecommendationsElements().  Nie dodajemy
    // tutaj dodatkowego listenera, aby nie powielić logiki generowania.
    // Zajmijmy się przyciskiem generującym zalecenia po wybraniu strategii.
    const generateBtn = document.getElementById('generateDietBtn');
    if (generateBtn && !generateBtn.dataset.dietGenerateAttached) {
      generateBtn.addEventListener('click', function() {
        dietRecommendationsRequestNewMyth();
        dietRecommendationsSetActiveMode('smart');
        const result = buildDietSmartRecommendationResult();
        if (!result) return;
        const resultDiv = document.getElementById('dietRecommendationsResult');
        if (resultDiv) {
          renderDietRecommendationResult(resultDiv, result, 'smart');
        }
        if (typeof copyDietTextToClipboard === 'function') {
          copyDietTextToClipboard(result.textOutput || '').then(function() {
            if (typeof showMetabolicToast === 'function') showMetabolicToast();
          }).catch(function() {
            if (typeof showMetabolicToast === 'function') showMetabolicToast();
          });
        }
      });
      generateBtn.dataset.dietGenerateAttached = 'true';
    }

    const generateEnergyBtn = document.getElementById('generateEnergyDietBtn');
    if (generateEnergyBtn && !generateEnergyBtn.dataset.dietGenerateAttached) {
      generateEnergyBtn.addEventListener('click', function() {
        dietRecommendationsSetActiveMode('energy');
        const result = buildDietEnergyRecommendationResult();
        if (!result) return;
        const resultDiv = document.getElementById('dietEnergyResult');
        if (resultDiv) {
          renderDietRecommendationResult(resultDiv, result, 'energy');
        }
        if (typeof copyDietTextToClipboard === 'function') {
          copyDietTextToClipboard(result.textOutput || '').then(function() {
            if (typeof showMetabolicToast === 'function') showMetabolicToast();
          }).catch(function() {
            if (typeof showMetabolicToast === 'function') showMetabolicToast();
          });
        }
      });
      generateEnergyBtn.dataset.dietGenerateAttached = 'true';
    }

    ensureDietPersonalizationSurveyUi(document.getElementById('dietRecommendationsContent'));
    updateDietCardLabels();
    const patientFacingToggle = document.getElementById('patientFacingToggle');
    if (patientFacingToggle && !patientFacingToggle.dataset.dietPatientFacingAttached) {
      patientFacingToggle.addEventListener('change', function() {
        updateDietCardLabels();
        refreshDietRecommendationsIfVisible();
      });
      patientFacingToggle.dataset.dietPatientFacingAttached = 'true';
    }
    const nutritionNormsToggle = document.getElementById('nutritionNormsFlag');
    if (nutritionNormsToggle && !nutritionNormsToggle.dataset.dietNutritionNormsAttached) {
      nutritionNormsToggle.addEventListener('change', function() {
        refreshDietRecommendationsIfVisible();
      });
      nutritionNormsToggle.dataset.dietNutritionNormsAttached = 'true';
    }
    ['reduceToggle', 'stabilizationToggle', 'growthEndedFlag', 'vitDSuppFlag', 'hydrationFlag', 'journeyFlag'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el && !el.dataset.dietPersonalizationRefreshAttached) {
        el.addEventListener('change', function() {
          updateDietSurveyAgeVisibility();
          refreshDietRecommendationsIfVisible();
        });
        el.dataset.dietPersonalizationRefreshAttached = 'true';
      }
    });
    // Ustaw widoczność przycisku zaleceń na podstawie początkowych danych
    updateDietRecommendationsVisibility();
  });
  // 8O-10d-d: dotychczasowy wrapper window.update z tego modułu został
  // przepięty na VildaUpdateHooks. Funkcja widoczności pozostaje bez zmian,
  // a registry wykonuje ją po hookach app.js: BMI p50 i UI idealnej wagi.
  const DIET_RECOMMENDATIONS_AFTER_UPDATE_HOOK_ID = 'diet:recommendations-visibility-after-update';

  function updateDietRecommendationsVisibilityAfterUpdate(context) {
    const source = context && context.source ? String(context.source) : '';
    if (source && source !== 'window.update' && source !== 'window.update-fallback') {
      return { skipped: true, reason: 'non-window-update-context', source };
    }
    if (typeof document === 'undefined') {
      return { skipped: true, reason: 'document-unavailable' };
    }
    updateDietRecommendationsVisibility();
    return { skipped: false };
  }

  let dietRecommendationsAfterUpdateHookRegistered = false;
  let dietRecommendationsAfterUpdateHookToken = null;
  if (typeof window !== 'undefined' && window.VildaUpdateHooks && typeof window.VildaUpdateHooks.registerAfterUpdateHook === 'function') {
    try {
      dietRecommendationsAfterUpdateHookToken = window.VildaUpdateHooks.registerAfterUpdateHook(updateDietRecommendationsVisibilityAfterUpdate, {
        id: DIET_RECOMMENDATIONS_AFTER_UPDATE_HOOK_ID,
        label: 'Diet recommendations visibility after update',
        group: 'diet-recommendations-update-migrated-wrapper',
        order: 30,
        replace: true
      });
      dietRecommendationsAfterUpdateHookRegistered = !!(dietRecommendationsAfterUpdateHookToken && dietRecommendationsAfterUpdateHookToken.ok === true);
    } catch (_) {
      dietRecommendationsAfterUpdateHookRegistered = false;
    }
  }

  function getDietRecommendationsUpdateHookSnapshot(options) {
    const opts = options || {};
    let registrySnapshot = null;
    try {
      registrySnapshot = window && window.VildaUpdateHooks && typeof window.VildaUpdateHooks.getSnapshot === 'function'
        ? window.VildaUpdateHooks.getSnapshot({ includeEvents: opts.includeEvents === true })
        : null;
    } catch (_) {
      registrySnapshot = null;
    }
    const registeredHooks = registrySnapshot && Array.isArray(registrySnapshot.hooks) ? registrySnapshot.hooks : [];
    const ownHook = registeredHooks.find(function(hook) { return hook && hook.id === DIET_RECOMMENDATIONS_AFTER_UPDATE_HOOK_ID; }) || null;
    const hookOrder = ownHook ? Number(ownHook.order) : null;
    const registeredIds = registeredHooks.map(function(hook) { return hook && hook.id; }).filter(Boolean);
    return {
      kind: 'vilda-diet-recommendations-update-hook-snapshot',
      step: '8O-10d-d',
      readOnly: true,
      didCallWindowUpdate: false,
      didRunHooks: false,
      didPatchWindowUpdate: false,
      migratedWrapperId: DIET_RECOMMENDATIONS_AFTER_UPDATE_HOOK_ID,
      hookRegisteredAtInstall: dietRecommendationsAfterUpdateHookRegistered,
      hookRegistered: !!ownHook,
      hookOrder: Number.isFinite(hookOrder) ? hookOrder : null,
      expectedOrderAfter: ['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update'],
      orderAfterAppHooks: !!(ownHook && registeredIds.indexOf('app:bmi50-info-after-update') >= 0 && registeredIds.indexOf('app:ideal-weight-ui-after-update') >= 0 && hookOrder > 20),
      legacyWrapperRemoved: true,
      finalWindowUpdateIsRegistryBridge: !!(typeof window !== 'undefined' && window.update && window.update.__vildaUpdateHooksRegistryWrapper === true),
      registry: registrySnapshot ? {
        version: registrySnapshot.version,
        step: registrySnapshot.step,
        registeredCount: registrySnapshot.registeredCount,
        migrationStatus: registrySnapshot.migrationStatus,
        migratedWrapperIds: registrySnapshot.migratedWrapperIds || [],
        migratedHookIdsRegistered: registrySnapshot.migratedHookIdsRegistered || []
      } : null,
      hook: ownHook ? {
        id: ownHook.id,
        label: ownHook.label,
        group: ownHook.group,
        order: ownHook.order,
        runs: ownHook.runs,
        failures: ownHook.failures
      } : null,
      nextStep: '8O-10d-e — końcowy audyt łańcucha update albo 8O-11a IndexedDB cleanup'
    };
  }
  // Udostępnij funkcję w obiekcie window, aby można ją było wywołać z innych modułów
  if (typeof window !== 'undefined') {
    window.__vildaDietRecommendationsAfterUpdateHookId = DIET_RECOMMENDATIONS_AFTER_UPDATE_HOOK_ID;
    window.__vildaDietRecommendationsAfterUpdateHookRegistered = dietRecommendationsAfterUpdateHookRegistered;
    window.__vildaDietRecommendationsVisibilityAfterUpdateFallback = updateDietRecommendationsVisibilityAfterUpdate;
    window.vildaGetDietRecommendationsUpdateHookSnapshot = getDietRecommendationsUpdateHookSnapshot;
    window.ensureDietRecommendationsElements = ensureDietRecommendationsElements;
    window.updateDietRecommendationsVisibility = updateDietRecommendationsVisibility;
    window.refreshDietRecommendationsIfVisible = refreshDietRecommendationsIfVisible;
    window.dietRecommendationsHasPdfAvailable = dietRecommendationsHasPdfAvailable;
    window.dietRecommendationsCollectPdfPages = dietRecommendationsCollectPdfPages;
    window.dietRecommendationsBuildPdfPackage = dietRecommendationsBuildPdfPackage;
    window.generateDietRecommendationsPdfReport = generateDietRecommendationsPdfReport;
    window.dietRecommendationsRequestNewMyth = dietRecommendationsRequestNewMyth;
    window.generateDietRecommendations = generateDietRecommendations;
    window.generateDietRecommendationsStabilization = generateDietRecommendationsStabilization;
    window.generateAdultDietRecommendations = generateAdultDietRecommendations;
    window.buildDietSmartRecommendationResult = buildDietSmartRecommendationResult;
    window.buildDietEnergyRecommendationResult = buildDietEnergyRecommendationResult;
  }
  if (typeof window !== 'undefined') {
    const dietRecommendationsApi = {
      __vildaDietRecommendations: true,
      version: VILDA_DIET_RECOMMENDATIONS_VERSION,
      ensureElements: ensureDietRecommendationsElements,
      updateVisibility: updateDietRecommendationsVisibility,
      updateVisibilityAfterUpdate: updateDietRecommendationsVisibilityAfterUpdate,
      getUpdateHookSnapshot: getDietRecommendationsUpdateHookSnapshot,
      refreshIfVisible: refreshDietRecommendationsIfVisible,
      getActiveMode: dietRecommendationsGetActiveMode,
      setActiveMode: dietRecommendationsSetActiveMode,
      buildSmartRecommendationResult: buildDietSmartRecommendationResult,
      buildEnergyRecommendationResult: buildDietEnergyRecommendationResult,
      buildRecommendationResult: buildDietRecommendationResult,
      generateRecommendations: generateDietRecommendations,
      generateStabilizationRecommendations: generateDietRecommendationsStabilization,
      generateAdultRecommendations: generateAdultDietRecommendations,
      collectPdfPages: dietRecommendationsCollectPdfPages,
      buildPdfPackage: dietRecommendationsBuildPdfPackage,
      generatePdfReport: generateDietRecommendationsPdfReport,
      hasPdfAvailable: dietRecommendationsHasPdfAvailable,
      requestNewMyth: dietRecommendationsRequestNewMyth,
      resetMythSelection: dietRecommendationsResetMythSelection,
      getLastOutputs: function() { return dietRecommendationsLastOutputs; },
      versionInfo: function() { return { version: VILDA_DIET_RECOMMENDATIONS_VERSION }; }
    };
    window.VildaDietRecommendations = dietRecommendationsApi;
    window.vildaDietRecommendations = dietRecommendationsApi;
    window.vildaDietRecommendationsVersion = function() { return VILDA_DIET_RECOMMENDATIONS_VERSION; };
  }

})();