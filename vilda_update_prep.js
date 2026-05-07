/* ==========================================================================
 * VildaUpdatePrep — przygotowanie i orkiestracja głównego update()
 *
 * Plik wydzielony z app.js w kroku 8A. Zachowuje publiczne API:
 * window.VildaUpdatePrep oraz dotychczasowe aliasy window.vildaUpdate*.
 * Nie zawiera zmian obliczeniowych — funkcje korzystają z globalnych helperów
 * aplikacji tak jak wcześniej, po załadowaniu app.js.
 * ========================================================================== */

/* ========================================================================== 
 * Krok 7A: warstwa przygotowująca refaktor dużej funkcji update()
 *
 * Ten blok nie zmienia logiki obliczeniowej. Centralizuje odczyt podstawowych
 * pól, walidację wejścia, mapę etapów oraz lekką diagnostykę przebiegu update(),
 * aby kolejne kroki mogły wydzielać mniejsze funkcje bez naruszania wzorów.
 * ========================================================================== */
const VILDA_UPDATE_PREP_VERSION = '2.55.0';
const VILDA_UPDATE_PREP_PEDIATRIC_BMI_UNAVAILABLE_LABEL = 'Brak klasyfikacji pediatrycznej — brak danych referencyjnych';
const VILDA_UPDATE_SECTION_MAP = Object.freeze([
  Object.freeze({ id: 'entry-guards', label: 'Guard strony i delegacja do kalkulatora klirensu', risk: 'low', helper: 'vildaUpdatePrepHandleEntryGuard()', publicAlias: 'vildaUpdateHandleEntryGuard()', nextHelper: 'vildaUpdatePrepHandleEntryGuard()' }),
  Object.freeze({ id: 'input-read', label: 'Odczyt wieku, masy, wzrostu i płci', risk: 'low', helper: 'vildaUpdatePrepReadMainInputs()', publicAlias: 'vildaUpdateReadMainInputs()', nextHelper: 'vildaUpdatePrepReadMainInputs()' }),
  Object.freeze({ id: 'module-visibility', label: 'Widoczność sekcji zależnych od wieku / trybu', risk: 'medium', helper: 'vildaUpdatePrepUpdateAdultMetrics()', publicAlias: 'vildaUpdateAdultMetrics()', nextHelper: 'vildaUpdatePrepUpdateAdultMetrics()' }),
  Object.freeze({ id: 'validation', label: 'Walidacja danych wejściowych i komunikaty', risk: 'medium', helper: 'vildaUpdatePrepHandleInputValidation()', publicAlias: 'vildaUpdateHandleInputValidation()', nextHelper: 'vildaUpdatePrepHandleInputValidation()' }),
  Object.freeze({ id: 'food-summary', label: 'Suma kalorii i analiza produktów / posiłków', risk: 'medium', helper: 'vildaUpdatePrepUpdateFoodSummary() / vildaUpdatePrepUpdateFoodBurnSummary()', publicAlias: 'vildaUpdateFoodSummary() / vildaUpdateFoodBurnSummary()', nextHelper: 'vildaUpdatePrepUpdateFoodSummary()' }),
  Object.freeze({ id: 'bmi-bmr', label: 'BMI, BMR, klasyfikacje i karty wyników', risk: 'high', helper: 'vildaUpdatePrepComputeBmiBmrState() / vildaUpdatePrepRenderBmiBmrResults()', publicAlias: 'vildaUpdateBmiBmrResults()', nextHelper: 'vildaUpdatePrepRenderBmiBmrResults()' }),
  Object.freeze({ id: 'weight-height-centiles', label: 'Karta centyli waga/wzrost oraz skrajne centyle', risk: 'high', helper: 'vildaUpdatePrepRenderWeightHeightCentileCard()', publicAlias: 'vildaUpdateWeightHeightCentileCard()', nextHelper: 'vildaUpdatePrepRenderWeightHeightCentileCard()' }),
  Object.freeze({ id: 'child-metrics', label: 'WFL, Cole, WHR, WLR i pozostałe metryki pediatryczne', risk: 'high', helper: 'vildaUpdatePrepUpdateChildMetrics()', publicAlias: 'vildaUpdateChildMetrics()', nextHelper: 'vildaUpdatePrepUpdateChildMetrics()' }),
  Object.freeze({ id: 'bmi-normalization', label: 'Droga do normy BMI, konsultacje i plan redukcji', risk: 'high', helper: 'vildaUpdatePrepUpdateBmiNormalizationAndPlan()', publicAlias: 'vildaUpdateBmiNormalizationAndPlan()', nextHelper: 'vildaUpdatePrepUpdateBmiNormalizationAndPlan()' }),
  Object.freeze({ id: 'adult-metrics', label: 'Interpretacje dorosłych i ryzyko metaboliczne', risk: 'medium', helper: 'vildaUpdatePrepUpdateAdultMetrics()', publicAlias: 'vildaUpdateAdultMetrics()', nextHelper: 'vildaUpdatePrepUpdateAdultMetrics()' }),
  Object.freeze({ id: 'optional-modules', label: 'Odświeżenie modułów dodatkowych i podsumowań', risk: 'medium', helper: 'vildaUpdatePrepRunPreValidationSynchronizers()', publicAlias: 'vildaUpdateOptionalSections()', nextHelper: 'vildaUpdatePrepRunPreValidationSynchronizers()' }),
  Object.freeze({ id: 'post-render', label: 'Repozycjonowanie, widoczność kart i drobne synchronizacje UI', risk: 'low', helper: 'vildaUpdatePrepRunPostRenderSynchronization() / vildaUpdatePrepCompleteMainUpdate()', publicAlias: 'vildaUpdatePostRenderUi()', nextHelper: 'vildaUpdatePrepRunPostRenderSynchronization()' })
]);
const VILDA_UPDATE_REFACTOR_PLAN = Object.freeze([
  Object.freeze({ step: '7A', status: 'done', scope: 'readMainInputs + validateMainInputs + diagnostyka przebiegu update()' }),
  Object.freeze({ step: '7B', status: 'done', scope: 'wydzielenie guardów, walidacji i komunikatów wejściowych bez zmian obliczeń' }),
  Object.freeze({ step: '7C', status: 'done', scope: 'wydzielenie sumy kalorii / food-summary oraz czasu spalania do wspólnych helperów' }),
  Object.freeze({ step: '7D', status: 'done', scope: 'wydzielenie stanu BMI/BMR, renderu karty BMI oraz podstawowych wyników dorosłych' }),
  Object.freeze({ step: '7E-1', status: 'done', scope: 'wydzielenie karty centyli waga/wzrost, lastWeightPercentile i lastHeightPercentile' }),
  Object.freeze({ step: '7E-2', status: 'done', scope: 'wydzielenie WFL, Cole i WHR do updateChildMetrics() bez zmiany obliczeń' }),
  Object.freeze({ step: '7E-3', status: 'done', scope: 'wydzielenie drogi do normy BMI, konsultacji i planu redukcji bez zmiany obliczeń' }),
  Object.freeze({ step: '7F', status: 'done', scope: 'wydzielenie pozostałych interpretacji dorosłych i ryzyka metabolicznego bez zmiany obliczeń' }),
  Object.freeze({ step: '7G', status: 'done', scope: 'wydzielenie odświeżania modułów opcjonalnych, czyszczenia wyników i końcowego post-render UI z update()' }),
  Object.freeze({ step: '7H', status: 'done', scope: 'końcowy przegląd update() jako orkiestratora: mapa przepływu, aliasy publiczne i redukcja duplikacji odczytu DOM' }),
  Object.freeze({ step: '8A', status: 'done', scope: 'wydzielenie warstwy VildaUpdatePrep z app.js do vilda_update_prep.js bez zmiany API window' }),
  Object.freeze({ step: '8B', status: 'done', scope: 'wydzielenie mostków inicjalizacji, HTML, loggera i zależności z app.js do vilda_app_helpers.js z zachowaniem API' }),
  Object.freeze({ step: '8C', status: 'done', scope: 'wydzielenie statycznych danych produktów, słowników makro i aktywności z app.js do vilda_food_data.js' }),
  Object.freeze({ step: '8D', status: 'done', scope: 'wydzielenie logiki spalania aktywności z app.js do vilda_activity_burn.js bez zmiany wzorów' }),
  Object.freeze({ step: '8E', status: 'done', scope: 'wydzielenie logiki food-summary i lokalnego odświeżania karty posiłków do vilda_food_summary.js bez zmiany obliczeń' }),
  Object.freeze({ step: '8F', status: 'done', scope: 'wydzielenie pozostałej warstwy makro-praktyki do vilda_macro_practice.js z zachowaniem globalnych nazw' }),
  Object.freeze({ step: '8G', status: 'done', scope: 'audyt pozostałych dużych sekcji app.js i wybór następnego bezpiecznego kandydata do wydzielenia' }),
  Object.freeze({ step: '8H', status: 'done', scope: 'wydzielenie prefiksowanego bloku patientReport* do vilda_patient_report.js z zachowaniem globalnego API' }),
  Object.freeze({ step: '8I', status: 'done', scope: 'wydzielenie zaleceń dietetycznych / ankiety / PDF zaleceń do vilda_diet_recommendations.js z zachowaniem globalnego API' }),
  Object.freeze({ step: '8J', status: 'done', scope: 'wydzielenie modułu Down Syndrome do vilda_down_syndrome.js i ryzyka anoreksji do vilda_anorexia_risk.js z zachowaniem globalnego API' }),
  Object.freeze({ step: '8K', status: 'done', scope: 'audyt i przygotowanie wydzielenia importu/eksportu JSON oraz restore/persistence UI; mapa funkcji, zależności i etapów bez przenoszenia logiki' }),
  Object.freeze({ step: '8L-1', status: 'done', scope: 'wydzielenie neutralnych helperów importu/eksportu JSON i sanityzatorów do vilda_data_import_export.js bez przenoszenia applyLoadedData()' }),
  Object.freeze({ step: '8L-2', status: 'done', scope: 'wydzielenie collectUserData/saveUserData oraz wiring przycisków zapisu/wczytywania do vilda_data_import_export.js z zachowaniem window.vildaExport' }),
  Object.freeze({ step: '8L-3', status: 'done', scope: 'wydzielenie cichych setterów i restore trybu PRO / źródeł centyli do vilda_data_import_export.js bez dotykania applyLoadedData()' }),
  Object.freeze({ step: '8L-4', status: 'done', scope: 'wydzielenie rehydratacji historii advanced/intake do vilda_data_import_export.js z wrapperami app.js' }),
  Object.freeze({ step: '8L-5', status: 'done', scope: 'wydzielenie stanu przycisków zapisu/wczytywania oraz autosave sesji głównej do vilda_data_import_export.js' }),
  Object.freeze({ step: '8L-6a', status: 'done', scope: 'wydzielenie clearAllData() i resetGrowthHistoryModulesAfterClear() do vilda_data_import_export.js bez przenoszenia restore/applyLoadedData()' }),
  Object.freeze({ step: '8L-6b', status: 'done', scope: 'wydzielenie restoreLoadedState(), showRestoreButton() i restoreStateBtn do vilda_data_import_export.js bez przenoszenia applyLoadedData()' }),
  Object.freeze({ step: '8L-7a', status: 'done', scope: 'wydzielenie handleFile(), walidacji pliku JSON i FileReader do vilda_data_import_export.js bez przenoszenia applyLoadedData()' }),
  Object.freeze({ step: '8L-7b', status: 'done', scope: 'wydzielenie syncSharedUserDataFromLoadedData() i normalizeSharedPersistRoot() do vilda_data_import_export.js' }),
  Object.freeze({ step: '8L-7c', status: 'done', scope: 'wydzielenie applyLoadedData() do vilda_data_import_export.js z zachowaniem wrappera app.js i window.vildaExport' }),
  Object.freeze({ step: '8M', status: 'done', scope: 'audyt końcowy importu/eksportu JSON po wydzieleniu; potwierdzenie wrapperów i API VildaDataImportExport' }),
  Object.freeze({ step: '8N', status: 'done', scope: 'audyt granic zaawansowanego wzrastania, zależności z raportami, importem JSON, GH/IGF i intake bez przenoszenia logiki' }),
  Object.freeze({ step: '8O-1', status: 'done', scope: 'utworzenie vilda_advanced_growth.js i przeniesienie neutralnych helperów formatowania / historii bez zmiany obliczeń' }),
  Object.freeze({ step: '8O-2', status: 'done', scope: 'wydzielenie UI formularza i wierszy advanced growth do vilda_advanced_growth.js bez przenoszenia calculateGrowthAdvanced(), GH/import/intake sync' }),
  Object.freeze({ step: '8O-3', status: 'done', scope: 'wydzielenie raportu HTML/PDF advanced growth do vilda_advanced_growth.js z zachowaniem globalnych aliasów raportu' }),
  Object.freeze({ step: '8O-4', status: 'done', scope: 'wydzielenie kontroli dostępu PRO i źródeł danych wzrastania do vilda_advanced_growth.js z wrapperami app.js' }),
  Object.freeze({ step: '8O-5', status: 'done', scope: 'wydzielenie mostka importu GH/IGF-1 do historii advanced growth do vilda_advanced_growth.js z wrapperami app.js' }),
  Object.freeze({ step: '8O-5a', status: 'done', scope: 'hotfix pustego autosave po clearAllData(): sesja główna nie zapisuje ani nie odtwarza pustego snapshotu z domyślną płcią' }),
  Object.freeze({ step: '8O-5b', status: 'done', scope: 'hotfix sharedUserData po imporcie JSON i pełnym czyszczeniu: czyszczenie resztek loadedComparisonData, UI poprzedniego pomiaru i blokady płci' }),
  Object.freeze({ step: '8O-6', status: 'done', scope: 'wydzielenie silników predykcyjnych Bayley-Pinneau/RWT, delegacji Reinehr/CDGP i modelu wiarygodności do vilda_advanced_growth.js z wrapperami app.js' }),
  Object.freeze({ step: '8O-7a', status: 'done', scope: 'przygotowanie adapterów wejścia/wyjścia dla calculateGrowthAdvanced(): snapshot wejścia, payload window.advancedGrowthData i commit/clear bez przenoszenia orkiestratora' }),
  Object.freeze({ step: '8O-7b', status: 'done', scope: 'wydzielenie pomocniczego lifecycle advanced growth: clear/commit/finalize stanu window.advancedGrowthData bez przenoszenia orkiestratora' }),
  Object.freeze({ step: '8O-7c', status: 'done', scope: 'przeniesienie calculateGrowthAdvanced() jako orkiestratora do VildaAdvancedGrowth z wrapperem kompatybilnościowym w app.js' }),
  Object.freeze({ step: '8O-7d', status: 'done', scope: 'walidacja po przeniesieniu orkiestratora: advanced growth, raport, JSON/clear, GH/IGF i estimated intake przed synchronizacją advanced ↔ intake' }),
  Object.freeze({ step: '8O-8a', status: 'done', scope: 'audyt i przygotowanie synchronizacji advanced growth ↔ estimated intake: mapa funkcji, diagnostyka snapshotu i kontrakt zależności bez przenoszenia logiki parowania' }),
  Object.freeze({ step: '8O-8b', status: 'done', scope: 'wydzielenie neutralnych helperów odczytu wierszy, syncId, wieku i detekcji danych advanced ↔ intake do VildaAdvancedGrowth; parowanie i event wiring pozostają w app.js' }),
  Object.freeze({ step: '8O-8c', status: 'done', scope: 'wydzielenie operacji kopiowania/backfill pojedynczego wiersza advanced ↔ intake do VildaAdvancedGrowth z wrapperami app.js; parowanie, event wiring i add/remove handlers pozostają w app.js' }),
  Object.freeze({ step: '8O-8d', status: 'done', scope: 'wydzielenie parowania list wierszy advanced ↔ intake do VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder() z wrapperem app.js; event wiring i add/remove handlers pozostają w app.js' }),
  Object.freeze({ step: '8O-8e', status: 'done', scope: 'wydzielenie handlerów add/remove synchronizacji advanced ↔ intake do VildaAdvancedGrowth z wrapperami app.js; event wiring pozostaje w app.js' }),
  Object.freeze({ step: '8O-8f', status: 'done', scope: 'wydzielenie/delegacja event wiring input/change synchronizacji advanced ↔ intake do VildaAdvancedGrowth z wrapperem app.js' }),
  Object.freeze({ step: '8O-8g', status: 'done', scope: 'końcowa walidacja pełnej synchronizacji advanced ↔ intake po wydzieleniu helperów, operacji, parowania, handlerów i event wiring; bez kolejnego dużego refaktoru' }),
  Object.freeze({ step: '8O-9a', status: 'done', scope: 'read-only audyt karty estimated intake: snapshot diagnostyczny, kontrakt zależności i granica przyszłego wydzielenia bez zmian obliczeń' }),
  Object.freeze({ step: '8O-9b', status: 'done', scope: 'wydzielenie neutralnych helperów readIntakeRows(), getIntakeRowHeight() i buildIntakeIntervals() do vilda_estimated_intake.js z wrapperami app.js' }),
  Object.freeze({ step: '8O-9c', status: 'done', scope: 'read-only audyt funkcji alertowych collectIntakeRowsForAlertProbe()/hasPotentialIntakeAlerts(); bez przenoszenia logiki i bez uruchamiania alertów' }),
  Object.freeze({ step: '8O-9d-lite', status: 'done', scope: 'wydzielenie tylko collectIntakeRowsForAlertProbe() do vilda_estimated_intake.js jako helper DI z wrapperem i fallbackiem app.js; hasPotentialIntakeAlerts() pozostaje w app.js' }),
  Object.freeze({ step: '8O-9e', status: 'done', scope: 'przygotowanie seamu calcEstimatedIntake(): input model, last observed model, commit/clear stanu window i read-only snapshot bez przenoszenia pełnej kalkulacji' }),
  Object.freeze({ step: '8O-9f', status: 'done', scope: 'wydzielenie czystego modelu obliczeniowego estimated intake do vilda_estimated_intake.js; app.js zachowuje render DOM, commit window.* i post-render risk checks' }),
  Object.freeze({ step: '8O-T1', status: 'done', scope: 'dodanie stałego, read-only zestawu smoke testów regresyjnych dla estimated intake, kontraktów VildaDeps, synchronizacji advanced↔intake i cache bustingu' }),
  Object.freeze({ step: '8O-10a', status: 'done', scope: 'jawna walidacja liczbowa głównych danych pacjenta; wiek 0 lat akceptowany, jeśli został wpisany jawnie' }),
  Object.freeze({ step: '8O-10b', status: 'done', scope: 'pediatryczna klasyfikacja BMI bez fallbacku do progów dorosłych przy braku percentyla dziecięcego' }),
  Object.freeze({ step: '8O-10c', status: 'done', scope: 'kolejka refreshy nutritionNormsModelUpdated w food-summary; szybkie odmienne zdarzenia nie są gubione podczas trwającego refreshu' }),
  Object.freeze({ step: '8O-10d-a', status: 'done', scope: 'przygotowanie registry hooków po update(): VildaUpdateHooks, snapshot i kontrakty bez przepinania window.update' }),
  Object.freeze({ step: '8O-10e', status: 'done', scope: 'bugfix świeżego imienia i nazwiska w PDF siatek centylowych: DOM i ostatnio edytowane pole przed window.advancedGrowthData.name' }),
  Object.freeze({ step: '8O-10d-b', status: 'done', scope: 'przepięcie pierwszego wrappera window.update z app.js na VildaUpdateHooks: BMI p50 info jako hook, bridge zachowuje kolejność łańcucha' }),
  Object.freeze({ step: '8O-10d-c', status: 'done', scope: 'przepięcie drugiego wrappera window.update z app.js na VildaUpdateHooks: updateIdealWeightUI jako hook po BMI p50' }),
  Object.freeze({ step: '8O-10d-d', status: 'done', scope: 'przepięcie wrappera window.update z vilda_diet_recommendations.js na VildaUpdateHooks: updateDietRecommendationsVisibility jako hook po hookach app.js' }),
  Object.freeze({ step: '8O-10d-e', status: 'done', scope: 'końcowy read-only audyt łańcucha window.update: potwierdzenie migracji znanych wrapperów i wykrycie pozostałych wrapperów nutrition poza tym torem' }),
  Object.freeze({ step: '8O-10d-f', status: 'done', scope: 'przepięcie wrappera window.update z nutrition_norms.js na VildaUpdateHooks: render norm żywieniowych jako hook order=40; nutrition_micros.js pozostaje do osobnego kroku' }),
  Object.freeze({ step: '8O-10d-g', status: 'done', scope: 'przepięcie wrappera window.update z nutrition_micros.js na VildaUpdateHooks: render mikroelementów jako hook order=50; brak znanych legacy-wrapperów update w torze 8O-10d' })
]);
const VILDA_APP_MODULARIZATION_AUDIT = Object.freeze([
  Object.freeze({
    id: 'advanced-growth-and-predictions',
    label: 'Zaawansowane wzrastanie, predykcje wzrostu i historia GH/intake',
    appJsLines: '8776-14326 + 16403-17248 + rozproszone mostki',
    approxLines: 6550,
    approxBytes: 300000,
    approxFunctions: 190,
    cohesion: 'medium',
    extractionRisk: 'high',
    recommendedTiming: 'done-8O-8g-next-8O-9',
    proposedFile: 'vilda_advanced_growth.js',
    auditedIn: '8N',
    reason: 'Największy nierozdzielony blok po 8M. Ma spójny rdzeń advanced growth, ale jest powiązany z importem JSON, raportem pacjenta, GH/IGF, intake, PDF, siatkami centylowymi i globalnym window.advancedGrowthData.'
  }),
  Object.freeze({
    id: 'diet-recommendations',
    label: 'Zalecenia dietetyczne, ankieta, smart goals i eksport PDF zaleceń',
    appJsLines: '4335-9304',
    approxLines: 4970,
    approxBytes: 284745,
    approxFunctions: 130,
    cohesion: 'medium',
    extractionRisk: 'medium-high',
    recommendedTiming: 'done-8I',
    proposedFile: 'vilda_diet_recommendations.js',
    extractedFile: 'vilda_diet_recommendations.js',
    extractedIn: '8I',
    reason: 'Duży blok z własnym modułem UI; wydzielony w 8I z zachowaniem globalnych funkcji dla widoczności, ankiety i PDF zaleceń.'
  }),
  Object.freeze({
    id: 'save-load-persistence-json',
    label: 'Import/eksport JSON, restore, applyLoadedData i persistence UI',
    appJsLines: '17735-21428',
    approxLines: 3694,
    approxBytes: 162239,
    approxFunctions: 49,
    cohesion: 'medium',
    extractionRisk: 'high',
    recommendedTiming: 'done-8L-7c-audited-8M',
    proposedFile: 'vilda_data_import_export.js',
    preparedIn: '8K',
    extractedFile: 'vilda_data_import_export.js',
    extractedIn: '8L-1..8L-7c',
    auditedIn: '8M',
    reason: 'Blok został wydzielony etapowo w 8L-1..8L-7c. Po 8M app.js zachowuje wrappery kompatybilnościowe, a pełne ścieżki importu/eksportu, restore, clear i autosave są w VildaDataImportExport.'
  }),
  Object.freeze({
    id: 'professional-summary-patient-report',
    label: 'Podsumowanie profesjonalne i raport pacjenta patientReport*',
    appJsLines: '9305-15418',
    approxLines: 6114,
    approxBytes: 258323,
    approxFunctions: 159,
    cohesion: 'high',
    extractionRisk: 'medium',
    recommendedTiming: 'done-8H',
    proposedFile: 'vilda_patient_report.js',
    extractedFile: 'vilda_patient_report.js',
    extractedIn: '8H',
    reason: 'Bardzo duży, ale spójny prefiksowo blok; większość funkcji ma nazwę patientReport*, a wywołania zewnętrzne zostały zachowane przez globalne funkcje.'
  }),
  Object.freeze({
    id: 'bootstrap-config-energy-wfl',
    label: 'Konfiguracja, PAL/energia, WFL i podstawowe helpery startowe',
    appJsLines: '1-4334',
    approxLines: 4334,
    approxBytes: 178614,
    approxFunctions: 101,
    cohesion: 'low-medium',
    extractionRisk: 'medium-high',
    recommendedTiming: 'after smaller modules',
    proposedFile: 'vilda_energy_engine.js',
    reason: 'Zawiera kilka różnych tematów; najlepiej dzielić dopiero po oddzieleniu raportów i import/eksport.'
  }),
  Object.freeze({
    id: 'bmi-lms-intake-whr-ideal-weight',
    label: 'BMI LMS, szacowane spożycie, WHR i idealna masa',
    appJsLines: '26113-29515',
    approxLines: 3403,
    approxBytes: 164327,
    approxFunctions: 75,
    cohesion: 'medium',
    extractionRisk: 'medium-high',
    recommendedTiming: 'after patient-report',
    proposedFile: 'vilda_growth_metrics.js / vilda_intake_estimation.js',
    reason: 'Część nadaje się do dalszego podziału, ale najpierw trzeba rozdzielić intake od LMS/WHR.'
  }),
  Object.freeze({
    id: 'ui-init-down-syndrome-anorexia',
    label: 'Inicjalizacje UI, Down Syndrome i moduł ryzyka anoreksji',
    appJsLines: '15419-18100',
    approxLines: 2682,
    approxBytes: 126354,
    approxFunctions: 59,
    cohesion: 'low-medium',
    extractionRisk: 'medium',
    recommendedTiming: 'done-8J',
    proposedFile: 'vilda_down_syndrome.js / vilda_anorexia_risk.js',
    extractedFiles: ['vilda_down_syndrome.js', 'vilda_anorexia_risk.js'],
    extractedIn: '8J',
    reason: 'W kroku 8J wydzielono osobno centyle zespołu Downa oraz detekcję ryzyka anoreksji, zachowując globalne funkcje __ds_*, window.detectAnRisk i window.anorexiaRiskAdjust.'
  }),
  Object.freeze({
    id: 'tail-wiring',
    label: 'Końcowe drobne podpięcia i wiring',
    appJsLines: '35996-36103',
    approxLines: 108,
    approxBytes: 4260,
    approxFunctions: 5,
    cohesion: 'low',
    extractionRisk: 'low',
    recommendedTiming: 'cleanup',
    proposedFile: null,
    reason: 'Za mały zysk rozmiarowy; warto porządkować dopiero przy finalnym clean-upie.'
  })
]);
const VILDA_APP_NEXT_EXTRACTION_CANDIDATE = Object.freeze({
  step: '8O-9',
  sectionId: 'estimated-intake-card',
  proposedFile: 'vilda_estimated_intake.js',
  strategy: 'po walidacji 8O-8g przejść do osobnego, etapowego wydzielenia karty estimated intake: intakeAddRow(), calcEstimatedIntake(), setupEstimatedIntake() i powiązane helpery, bez naruszania window.intakeHistory oraz synchronizacji advanced ↔ intake',
  keepGlobals: [
    'window.intakeHistory',
    'window.intakeEstimatedKcalPerDay',
    'window.intakeAddRow',
    'window.calcEstimatedIntake',
    'window.setupEstimatedIntake',
    'window.vildaEnsureAdvancedIntakePairing',
    'window.vildaGetAdvancedIntakeSyncAuditSnapshot',
    'window.vildaGetEstimatedIntakeAuditSnapshot',
    'window.advancedGrowthData',
    'window.calculateGrowthAdvanced'
  ],
  prerequisites: [
    'nie zmieniać kształtu window.intakeHistory ani window.advancedGrowthData',
    'utrzymać pierwszy zablokowany wiersz intake jako bieżące dane użytkownika',
    'utrzymać parowanie data-adv-intake-sync-id z kroku 8O-8',
    'utrzymać guard window.__vildaSuspendAdvIntakeSync',
    'nie przenosić rehydratacji JSON w tym samym kroku co calcEstimatedIntake()',
    'porównać window.vildaGetAdvancedIntakeSyncAuditSnapshot({ includeRows: true }) przed i po pierwszym wydzieleniu 8O-9',
    'porównać window.vildaGetEstimatedIntakeAuditSnapshot({ includeRows: true }) przed i po delegacji neutralnych helperów estimated intake',
    'powtórzyć regresję JSON → Wyczyść wszystkie pola → reload po każdym podkroku 8O-9'
  ]
});

const VILDA_ADVANCED_GROWTH_BOUNDARY_AUDIT = Object.freeze({
  step: '8N',
  status: 'done',
  candidateFile: 'vilda_advanced_growth.js',
  appJsRoleAfterAudit: 'implementation-still-in-app-js',
  totalCurrentFootprint: Object.freeze({
    appJsApproxMainLines: 6550,
    appJsPrimarySpans: ['8776-14326', '16403-17248'],
    appJsSupportingSpans: ['349-543', '2929-3186', '4167-4231', '8413-8485', '17735-21428 persistence wrappers'],
    topLevelFunctionCountApprox: 190
  }),
  submodules: Object.freeze([
    Object.freeze({
      id: 'advanced-access-and-source-controls',
      label: 'Dostęp PRO, źródła danych wzrastania i widoczność advanced UI',
      appJsLines: '349-543',
      approxFunctions: 11,
      risk: 'medium',
      movePhase: '8O-4',
      representativeFunctions: ['updateAdvancedGrowthAccess', 'getGrowthDataSourceAgeYears', 'normalizeGrowthDataSource', 'syncGrowthDataSourceInputs', 'refreshGrowthChartActionControls'],
      externalDependencies: ['professionalMode', 'updateAdvancedMeasurementAnalysisControls', 'window.updateAdvancedCentileChartButton'],
      extractedFile: 'vilda_advanced_growth.js',
      extractedIn: '8O-4'
    }),
    Object.freeze({
      id: 'advanced-growth-ui-core',
      label: 'Formularz advanced growth, wiersze pomiarowe, przyciski i podstawowe UI',
      appJsLines: '8776-8954, 10433-10973',
      approxFunctions: 12,
      risk: 'medium-high',
      movePhase: '8O-2',
      representativeFunctions: ['setupAdvancedGrowth', 'isAdvancedGrowthMainPage', 'isAdvancedGrowthProModeActive', 'ensureAdvancedGrowthReportControls', 'addAdvMeasurementRow', 'updateAdvAgeMax'],
      externalDependencies: ['calcForm DOM', 'VildaHtml', 'VildaLogger', 'calculateGrowthAdvanced', 'importTherapyPointsToAdvancedGrowth'],
      keepGlobals: ['window.vildaHandleAdvancedMeasurementAdd', 'window.vildaHandleAdvancedMeasurementRowRemove'],
      extractedFile: 'vilda_advanced_growth.js',
      extractedIn: '8O-2'
    }),
    Object.freeze({
      id: 'advanced-history-metrics',
      label: 'Metryki historii pomiarów, fallback źródeł i tekstowe podsumowania wierszy',
      appJsLines: '8959-9394, 9496-9670',
      approxFunctions: 32,
      risk: 'low-medium',
      movePhase: '8O-1',
      representativeFunctions: ['advHistoryFormatAgeMonths', 'advHistoryResolveMetric', 'advHistoryBuildSourceSummary', 'collectAdvancedMeasurements', 'advGrowthCollectAllPointsForReport', 'advGrowthBuildReportRows'],
      externalDependencies: ['getChildLMS', 'getBmiLmsBySource', 'calculateLmsZScore', 'bmiPercentileChild', 'bmiCategoryChild'],
      keepGlobals: ['advGrowthCollectHistoricalPointsForReport', 'advGrowthBuildReportRows']
    }),
    Object.freeze({
      id: 'advanced-pdf-report-rendering',
      label: 'Raport PDF/HTML zaawansowanego wzrastania',
      appJsLines: '9672-10431',
      approxFunctions: 18,
      risk: 'medium-high',
      movePhase: '8O-3',
      representativeFunctions: ['advGrowthBuildPdfMakeDefinition', 'advGrowthBuildReportPresentationModel', 'advGrowthBuildHtmlReportMarkup', 'advGrowthGeneratePdfViaCanvas', 'generateAdvancedGrowthPdfReport'],
      externalDependencies: ['jsPDF', 'html2canvas', 'pdfMake CDN fallback', 'window.advancedGrowthData', 'vilda_patient_report.js'],
      keepGlobals: ['generateAdvancedGrowthPdfReport', 'advGrowthBuildHtmlReportMarkup'],
      extractedFile: 'vilda_advanced_growth.js',
      extractedIn: '8O-3'
    }),
    Object.freeze({
      id: 'gh-igf-import-bridge',
      label: 'Import punktów GH/IGF-1 do historii advanced growth',
      appJsLines: '10991-11453',
      approxFunctions: 9,
      risk: 'high',
      movePhase: '8O-5',
      representativeFunctions: ['getGhAdvancedCurrentBasics', 'ghTherapyPointMatchesCurrentBasics', 'ghAdvancedRowMatchesCurrentBasics', 'importTherapyPointsToAdvancedGrowth'],
      externalDependencies: ['GH_THERAPY_POINTS module storage', 'gh_therapy_monitor.js', 'IndexedDB/BroadcastChannel helpers', 'advanced row DOM'],
      regressionScenarios: ['duplikowanie punktów GH po wejściu na index.html', 'nadpisanie legacy wierszy GH', 'brak importu przy aktywnej blokadzie __vildaSuppressGhAdvancedImportUntil'],
      extractedFile: 'vilda_advanced_growth.js',
      extractedIn: '8O-5'
    }),
    Object.freeze({
      id: 'prediction-engines',
      label: 'Bayley-Pinneau, RWT, Reinehr/CDGP i ocena wiarygodności predykcji',
      appJsLines: 'po 8O-7a w app.js zostają wrappery kompatybilnościowe; implementacja w vilda_advanced_growth.js',
      approxFunctions: 52,
      risk: 'high',
      movePhase: '8O-6',
      representativeFunctions: ['calculateBayleyPinneauPrediction', 'buildBayleyPinneauResultHtml', 'calculateRWTPrediction', 'buildRWTResultHtml', 'advGrowthBuildPredictionReliabilityModel'],
      externalDependencies: ['bayleyPinneauData', 'rwtData', 'reinehrCdgpData', 'advGrowthCalculateReinehrCdgpPrediction'],
      extractedFile: 'vilda_advanced_growth.js',
      extractedIn: '8O-6',
      keepInAppUntil: 'calculateGrowthAdvanced() nadal składa wynik z tych silników przez wrappery app.js'
    }),
    Object.freeze({
      id: 'main-advanced-calculation',
      label: 'Główne calculateGrowthAdvanced() i window.advancedGrowthData',
      appJsLines: '13003-13496',
      approxFunctions: 2,
      risk: 'very-high',
      movePhase: '8O-7',
      representativeFunctions: ['calculateGrowthAdvanced', 'clearAdvancedGrowthCard'],
      externalDependencies: ['target height', 'height velocity', 'Bayley/RWT/Reinehr', 'stabilization eligibility', 'patient report', 'centile chart overlays'],
      keepGlobals: ['window.advancedGrowthData', 'window.calculateGrowthAdvanced', 'window.clearAdvancedGrowthCalculationState', 'window.commitAdvancedGrowthCalculationState', 'window.finalizeAdvancedGrowthCalculationLifecycle'],
      partialLifecycleExtractedIn: '8O-7b'
    }),
    Object.freeze({
      id: 'advanced-intake-row-sync',
      label: 'Synchronizacja wierszy advanced growth ↔ estimated intake',
      appJsLines: '10526-11330 po wcześniejszych ekstrakcjach 8O',
      approxFunctions: 38,
      risk: 'high',
      movePhase: '8O-8',
      preparationIn: '8O-8a',
      helperExtractionIn: '8O-8b',
      rowOperationExtractionIn: '8O-8c',
      pairingExtractionIn: '8O-8d',
      handlerExtractionIn: '8O-8e',
      eventWiringExtractionIn: '8O-8f',
      finalValidationIn: '8O-8g',
      representativeFunctions: ['_pairAdvancedAndIntakeRowsByOrder', '_syncAdvRowToIntake', '_syncIntakeRowToAdv', 'handleAdvancedMeasurementAdd', 'handleIntakeHistoryAdd', 'setupAdvancedIntakeLiveWiring'],
      externalDependencies: ['intake rows DOM', 'advanced rows DOM', 'VildaDataImportExport.rehydrateAdvancedFromState', 'VildaDataImportExport.rehydrateIntakeFromState', 'window.__vildaSuspendAdvIntakeSync'],
      keepGlobals: ['window.vildaEnsureAdvancedIntakePairing', 'window.vildaHandleAdvancedMeasurementAdd', 'window.vildaHandleIntakeHistoryAdd', 'window.vildaHandleAdvancedMeasurementRowRemove', 'window.vildaHandleIntakeHistoryRowRemove', 'window.vildaGetAdvancedIntakeSyncAuditSnapshot']
    }),
    Object.freeze({
      id: 'estimated-intake-card',
      label: 'Szacowane spożycie energii, alerty i historia intake',
      appJsLines: '16403-17248',
      approxFunctions: 20,
      risk: 'medium-high',
      movePhase: '8O-9',
      representativeFunctions: ['intakeAddRow', 'readIntakeRows', 'buildIntakeIntervals', 'calcEstimatedIntake', 'setupEstimatedIntake'],
      externalDependencies: ['energyBuildIntakeObservedState', 'VildaFoodSummary', 'advancedGrowthData.measurements', 'window.intakeHistory'],
      keepGlobals: ['window.intakeHistory', 'window.intakeEstimatedKcalPerDay', 'window.intakeAddRow', 'window.calcEstimatedIntake']
    })
  ]),
  externalScriptsAndModules: Object.freeze([
    Object.freeze({ script: 'advanced_growth_kowd.js', role: 'Reinehr/CDGP i część zaawansowanych predykcji', loadOrder: 'przed app.js' }),
    Object.freeze({ script: 'bayley_pinneau_data.js', role: 'tabele Bayley-Pinneau', loadOrder: 'przed app.js' }),
    Object.freeze({ script: 'rwt_data.js', role: 'tabele Roche-Wainer-Thissen', loadOrder: 'przed app.js' }),
    Object.freeze({ script: 'reinehr_cdgp_data.js', role: 'dane Reinehr/CDGP', loadOrder: 'przed app.js' }),
    Object.freeze({ script: 'vilda_patient_report.js', role: 'czyta advancedGrowthData i wywołuje helpery raportu advanced', loadOrder: 'po app.js obecnie' }),
    Object.freeze({ script: 'vilda_data_import_export.js', role: 'rehydratacja advanced/intake, import JSON, clearAllData i session restore', loadOrder: 'przed app.js jako adapter z wrapperami app.js' }),
    Object.freeze({ script: 'gh_therapy_monitor.js', role: 'źródło punktów GH/IGF do importu advanced growth', loadOrder: 'moduł poboczny docpro/index' })
  ]),
  criticalGlobals: Object.freeze([
    'window.advancedGrowthData',
    'window.calculateGrowthAdvanced',
    'window.addAdvMeasurementRow',
    'window.importTherapyPointsToAdvancedGrowth',
    'window.generateAdvancedGrowthPdfReport',
    'window.advGrowthCollectHistoricalPointsForReport',
    'window.advGrowthBuildReportRows',
    'window.advGrowthBuildHtmlReportMarkup',
    'window.vildaHandleAdvancedMeasurementAdd',
    'window.vildaHandleAdvancedMeasurementRowRemove',
    'window.vildaEnsureAdvancedIntakePairing',
    'window.vildaRehydrateAdvancedFromState',
    'window.vildaRehydrateAdvancedRowsUI',
    'window.intakeHistory',
    'window.intakeEstimatedKcalPerDay',
    'window.intakeAddRow',
    'window.calcEstimatedIntake'
  ]),
  doNotMoveInFirstExtraction: Object.freeze([
    'calculateGrowthAdvanced()',
    'window.advancedGrowthData lifecycle',
    'rehydrateAdvancedFromState() / rehydrateIntakeFromState()',
    'applyLoadedData() and restoreLoadedState()',
    'pełny refaktor estimated intake card przed osobnym etapem 8O-9'
  ]),
  recommendedNextStep: '8O-T1'
});

const VILDA_ADVANCED_GROWTH_EXTRACTION_PLAN = Object.freeze([
  Object.freeze({
    step: '8O-1',
    status: 'done',
    scope: 'utworzono vilda_advanced_growth.js i przeniesiono neutralne helpery formatowania, escape, etykiet źródeł oraz read-only helpery historii',
    risk: 'low-medium',
    candidateFunctions: ['advHistoryEscapeHtml', 'advHistoryFormatNumber', 'advHistoryFormatAgeMonths', 'advHistorySourceLabel', 'advHistoryDecodeCentile', 'advHistoryPercentileText', 'advGrowthFormatSignedNumber', 'advGrowthSanitizePdfText', 'advGrowthSanitizePdfMultilineText', 'advGrowthHexToRgb'],
    keepInApp: ['calculateGrowthAdvanced', 'importTherapyPointsToAdvancedGrowth', 'window.advancedGrowthData lifecycle'],
    requiredSmokeTests: ['node --check', 'brak zmiany window.advancedGrowthData', 'generateAdvancedGrowthPdfReport nadal widoczny', 'raport pacjenta widzi helpery advanced'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-1'
  }),
  Object.freeze({
    step: '8O-2',
    status: 'done',
    scope: 'przeniesiono UI formularza i wierszy advanced growth do vilda_advanced_growth.js bez przenoszenia calculateGrowthAdvanced(), GH/import/intake sync',
    risk: 'medium-high',
    candidateFunctions: ['setupAdvancedGrowth', 'isAdvancedGrowthMainPage', 'isAdvancedGrowthProModeActive', 'addAdvMeasurementRow', 'updateAdvAgeMax', 'updateAdvancedMeasurementAnalysisControls'],
    keepGlobals: ['window.vildaHandleAdvancedMeasurementAdd', 'window.vildaHandleAdvancedMeasurementRowRemove']
  }),
  Object.freeze({
    step: '8O-3',
    status: 'done',
    scope: 'przeniesiono raport HTML/PDF advanced growth i kontrolki raportu do vilda_advanced_growth.js z zachowaniem wrapperów app.js',
    risk: 'medium-high',
    candidateFunctions: ['advGrowthBuildReportPresentationModel', 'advGrowthBuildHtmlReportMarkup', 'advGrowthBuildPdfMakeDefinition', 'generateAdvancedGrowthPdfReport'],
    keepGlobals: ['generateAdvancedGrowthPdfReport', 'advGrowthBuildHtmlReportMarkup'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-3'
  }),
  Object.freeze({
    step: '8O-4',
    status: 'done',
    scope: 'przeniesiono kontrolę dostępu PRO i źródła danych wzrastania do vilda_advanced_growth.js z wrapperami app.js i delegacją VildaUpdatePrep',
    risk: 'medium-high',
    candidateFunctions: ['updateAdvancedGrowthAccess', 'getGrowthDataSourceAgeYears', 'normalizeGrowthDataSource', 'syncGrowthDataSourceInputs', 'refreshGrowthChartActionControls', 'updateGrowthDataSourceControls'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-4'
  }),
  Object.freeze({
    step: '8O-5',
    status: 'done',
    scope: 'przeniesiono mostek importu punktów GH/IGF do vilda_advanced_growth.js z wrapperami app.js i zachowaniem algorytmu deduplikacji',
    risk: 'high',
    candidateFunctions: ['getGhAdvancedCurrentBasics', 'ghAdvancedApproxEq', 'importTherapyPointsToAdvancedGrowth', 'ghTherapyPointMatchesCurrentBasics', 'ghAdvancedRowMatchesCurrentBasics'],
    keepGlobals: ['window.importTherapyPointsToAdvancedGrowth', 'window.getGhAdvancedCurrentBasics', 'window.ghTherapyPointMatchesCurrentBasics', 'window.ghAdvancedRowMatchesCurrentBasics'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-5',
    requiredSmokeTests: ['node --check', 'brak duplikacji GH po odświeżeniu', 'ręczne wiersze advanced nie są przejmowane', 'blokada __vildaSuppressGhAdvancedImportUntil działa']
  }),
  Object.freeze({
    step: '8O-5a',
    status: 'done',
    scope: 'dodano guard pustej sesji głównej po pełnym czyszczeniu danych oraz neutralizację pustego loadedComparisonData w autosave',
    risk: 'medium',
    candidateFunctions: ['VildaDataImportExport.hasMeaningfulMainSessionData', 'saveMainSessionNow', 'restoreMainSessionIfAny', 'restoreAll'],
    extractedFile: 'vilda_data_import_export.js + app.js',
    extractedIn: '8O-5a',
    requiredSmokeTests: ['clearAllData po imporcie JSON + reload: brak restoreStateBtn', 'clearAllData po imporcie JSON + reload: sex nie jest disabled', 'pusty main session nie wywołuje applyLoadedData']
  }),
  Object.freeze({
    step: '8O-5b',
    status: 'done',
    scope: 'rozszerzono clearAllData o czyszczenie sharedUserData, pending autosave, UI karty poprzedniego pomiaru i semantyczny guard pustego autosave po imporcie JSON',
    risk: 'medium',
    candidateFunctions: ['vildaPersistClearAfterUserClear', 'clearSharedAutosaveResidue', 'resetLoadedComparisonUiResidue', 'persistHasMeaningfulCurrentFormData'],
    extractedFile: 'app.js + vilda_data_import_export.js',
    extractedIn: '8O-5b',
    requiredSmokeTests: ['JSON → Wyczyść wszystkie pola → reload: brak prevSummaryCard/restoreStateBtn', 'pusty sharedUserData nie jest odtwarzany', 'dietLevel/PAL/płeć jako wartości domyślne nie tworzą autosave']
  }),
  Object.freeze({
    step: '8O-6',
    status: 'done',
    scope: 'przeniesiono silniki predykcji Bayley/RWT, delegację Reinehr/CDGP, HTML wyników predykcji i reliability model do vilda_advanced_growth.js; app.js zachowuje wrappery',
    risk: 'high',
    candidateFunctions: ['calculateBayleyPinneauPrediction', 'calculateRWTPrediction', 'calculateReinehrCdgpPrediction', 'advGrowthBuildPredictionReliabilityModel', 'buildBayleyPinneauResultHtml', 'buildRWTResultHtml'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-6',
    requiredDataFiles: ['bayley_pinneau_data.js', 'rwt_data.js', 'reinehr_cdgp_data.js', 'advanced_growth_kowd.js'],
    requiredSmokeTests: ['porównanie wyników Bayley/RWT przed i po wydzieleniu', 'UI advanced growth: predykcje i reliability card', 'raport advanced growth i raport pacjenta']
  }),
  Object.freeze({
    step: '8O-7a',
    status: 'done',
    scope: 'przygotowano adaptery wejścia/wyjścia calculateGrowthAdvanced(): snapshot wejścia, payload i commit/clear window.advancedGrowthData',
    risk: 'high',
    candidateFunctions: ['collectAdvancedGrowthCalculationInput', 'buildAdvancedGrowthDataPayload', 'commitAdvancedGrowthDataPayload', 'clearAdvancedGrowthDataPayload'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-7a',
    requiredSmokeTests: ['adapter input/payload', 'predykcje bez regresji', 'kontrakt VildaDeps']
  }),
  Object.freeze({
    step: '8O-7b',
    status: 'done',
    scope: 'wydzielono pomocniczy lifecycle clear/commit/finalize advanced growth bez przenoszenia calculateGrowthAdvanced()',
    risk: 'high',
    candidateFunctions: ['clearAdvancedGrowthCalculationState', 'commitAdvancedGrowthCalculationState', 'finalizeAdvancedGrowthCalculationLifecycle'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-7b',
    requiredSmokeTests: ['clear path <18/invalid age', 'commit path z updateStabilizationEligibility', 'finalize path z kontrolkami/raportem/persist']
  }),
  Object.freeze({
    step: '8O-7c',
    status: 'done',
    scope: 'przeniesiono calculateGrowthAdvanced() jako orkiestrator do VildaAdvancedGrowth z wrapperem app.js, bez ruszania importu JSON i synchronizacji advanced/intake',
    risk: 'very-high',
    candidateFunctions: ['calculateGrowthAdvanced'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-7c',
    requiredSmokeTests: ['smoke orkiestratora valid/clear', 'kontrakt VildaDeps advanced-growth-calculation-orchestrator', 'import JSON advancedGrowthData', 'raport wzrastania PDF', 'wykres centylowy z punktami historii', 'plan stabilizacji / reduction eligibility']
  }),
  Object.freeze({
    step: '8O-7d',
    status: 'done',
    scope: 'walidacja po przeniesieniu orkiestratora: import JSON, raporty, GH/IGF, estimated intake i brak regresji clear/reload przed synchronizacją advanced ↔ intake',
    risk: 'high',
    candidateFunctions: [],
    requiredSmokeTests: ['manualny test UI advanced growth', 'JSON → Wyczyść wszystkie pola → reload', 'raport pacjenta z sekcją advanced growth', 'GH/IGF bez duplikacji']
  }),
  Object.freeze({
    step: '8O-8a',
    status: 'done',
    scope: 'audyt i przygotowanie synchronizacji advanced ↔ intake: dodano read-only snapshot diagnostyczny, mapę zależności i kontrakt VildaDeps bez zmiany logiki parowania',
    risk: 'high',
    candidateFunctions: ['vildaGetAdvancedIntakeSyncAuditSnapshot', '_pairAdvancedAndIntakeRowsByOrder', '_syncAdvRowToIntake', '_syncIntakeRowToAdv'],
    requiredSmokeTests: ['snapshot diagnostyczny bez mutacji DOM', 'kontrakt VildaDeps advanced-growth-intake-sync-audit', 'statyczna obecność handlerów add/remove/pairing']
  }),
  Object.freeze({
    step: '8O-8b',
    status: 'done',
    scope: 'wydzielono neutralne helpery synchronizacji advanced ↔ intake do VildaAdvancedGrowth: odczyt wierszy, syncId, wiek wierszy, detekcja danych, protected-row helpers i modułowy snapshot diagnostyczny; event wiring/parowanie/handlery pozostały w app.js',
    risk: 'high',
    candidateFunctions: ['_intkRows', '_advRows', '_getIntakeHistoryRows', '_getAdvIntakeSyncId', '_setAdvIntakeSyncId', '_advRowAgeMonths', '_intakeRowAgeMonths'],
    requiredSmokeTests: ['modułowe helpery advanced↔intake', 'snapshot diagnostyczny po delegacji', 'kontrakt VildaDeps advanced-growth-intake-sync-helpers']
  }),
  Object.freeze({
    step: '8O-8c',
    status: 'done',
    scope: 'wydzielono operacje kopiowania/backfill pojedynczego wiersza advanced↔intake do VildaAdvancedGrowth z wrapperami app.js; _pairAdvancedAndIntakeRowsByOrder(), event wiring i handlery add/remove pozostały w app.js',
    risk: 'high',
    candidateFunctions: ['_syncAdvRowToIntake', '_syncIntakeRowToAdv', '_copyValueIfTargetEmpty', '_backfillIntakeRowFromAdv', '_backfillAdvRowFromIntake'],
    requiredSmokeTests: ['row-copy advanced→intake', 'row-copy intake→advanced', 'backfill pustych pól', 'kontrakt VildaDeps advanced-growth-intake-sync-row-operations']
  }),
  Object.freeze({
    step: '8O-8d',
    status: 'done',
    scope: 'wydzielono parowanie list wierszy advanced↔intake do VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder() z wrapperem app.js; event wiring oraz handlery add/remove pozostały w app.js',
    risk: 'high',
    candidateFunctions: ['_pairAdvancedAndIntakeRowsByOrder', 'VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder'],
    requiredSmokeTests: ['pairing equalize rows', 'syncId preserve/create', 'backfill po parowaniu', 'kontrakt VildaDeps advanced-growth-intake-sync-pairing']
  }),
  Object.freeze({
    step: '8O-8e',
    status: 'done',
    scope: 'wydzielono/delegowano handlery add/remove synchronizacji advanced↔intake do VildaAdvancedGrowth z wrapperami app.js, nadal bez przenoszenia event wiring i bez zmian JSON/GH/IGF',
    risk: 'high',
    candidateFunctions: ['handleAdvancedMeasurementAdd', 'handleIntakeHistoryAdd', 'handleAdvancedMeasurementRowRemove', 'handleIntakeHistoryRowRemove'],
    requiredSmokeTests: ['add advanced+intake pair', 'add intake+advanced pair', 'remove advanced removes twin', 'remove intake removes twin', 'kontrakt VildaDeps advanced-growth-intake-sync-handlers']
  }),
  Object.freeze({
    step: '8O-8f',
    status: 'done',
    scope: 'wydzielono/delegowano event wiring input/change synchronizacji advanced↔intake do VildaAdvancedGrowth.setupAdvancedIntakeLiveWiring() z wrapperem app.js, bez zmian JSON/GH/IGF i bez przenoszenia calcEstimatedIntake()',
    risk: 'high',
    candidateFunctions: ['app:intake-live-wiring', 'setupAdvancedIntakeLiveWiring', 'handleAdvInput', 'handleIntakeInput', 'liveCb'],
    extractedFile: 'vilda_advanced_growth.js',
    extractedIn: '8O-8f',
    requiredSmokeTests: ['event wiring basic liveCb', 'event wiring advanced input', 'event wiring intake input', 'inicjalny pair/calc', 'kontrakt VildaDeps advanced-growth-intake-sync-live-wiring']
  }),
  Object.freeze({
    step: '8O-8g',
    status: 'done',
    scope: 'walidacja końcowa pełnej synchronizacji advanced↔intake po wydzieleniu helperów, operacji, parowania, handlerów i event wiring; bez kolejnego dużego przenoszenia logiki',
    risk: 'high',
    candidateFunctions: ['vildaGetAdvancedIntakeSyncAuditSnapshot', 'setupAdvancedIntakeLiveWiring', 'vildaEnsureAdvancedIntakePairing'],
    requiredSmokeTests: ['kontrakt VildaDeps advanced-growth-intake-sync-final-validation', 'kompozytowy smoke advanced↔intake: helpery + row-copy + pairing + add/remove + live wiring', 'JSON → Wyczyść wszystkie pola → reload guard', 'GH/IGF bez duplikacji w mock DOM']
  }),
  Object.freeze({
    step: '8O-9a',
    status: 'done',
    scope: 'dodano read-only snapshot diagnostyczny estimated intake i kontrakt VildaDeps, bez przenoszenia logiki',
    risk: 'low',
    candidateFunctions: ['vildaGetEstimatedIntakeAuditSnapshot', 'readIntakeRows', 'buildIntakeIntervals'],
    requiredSmokeTests: ['snapshot estimated intake bez mutacji', 'kontrakt VildaDeps estimated-intake-card-audit']
  }),
  Object.freeze({
    step: '8O-9b',
    status: 'done',
    scope: 'wydzielono neutralne helpery estimated intake do vilda_estimated_intake.js z wrapperami app.js; bez przenoszenia calcEstimatedIntake(), setupEstimatedIntake() i intakeAddRow()',
    risk: 'medium',
    candidateFunctions: ['readIntakeRows', 'getIntakeRowHeight', 'buildIntakeIntervals'],
    extractedFile: 'vilda_estimated_intake.js',
    extractedIn: '8O-9b',
    requiredSmokeTests: ['modułowe helpery estimated intake', 'kontrakt VildaDeps estimated-intake-card-helpers', 'snapshot estimated intake po delegacji']
  }),
  Object.freeze({
    step: '8O-9c',
    status: 'done',
    scope: 'audyt funkcji alertowych estimated intake: dodano read-only snapshot alert-probe i kontrakt VildaDeps bez przenoszenia collectIntakeRowsForAlertProbe()/hasPotentialIntakeAlerts()',
    risk: 'medium-high',
    candidateFunctions: ['collectIntakeRowsForAlertProbe', 'hasPotentialIntakeAlerts'],
    extractedFile: null,
    extractedIn: null,
    contract: 'estimated-intake-alert-probe-audit',
    requiredSmokeTests: ['snapshot alert-probe bez uruchamiania alertów', 'kontrakt VildaDeps estimated-intake-alert-probe-audit', 'potwierdzenie, że funkcje alertowe nadal są w app.js']
  }),
  Object.freeze({
    step: '8O-9d-lite',
    status: 'done',
    scope: 'wydzielono collectIntakeRowsForAlertProbe() do vilda_estimated_intake.js jako helper z jawnymi zależnościami; app.js zachowuje wrapper i fallback, a hasPotentialIntakeAlerts() pozostaje w app.js',
    risk: 'medium',
    candidateFunctions: ['collectIntakeRowsForAlertProbe'],
    extractedFile: 'vilda_estimated_intake.js',
    extractedIn: '8O-9d-lite',
    contract: 'estimated-intake-alert-probe-collector',
    requiredSmokeTests: ['VildaEstimatedIntake.collectIntakeRowsForAlertProbe dostępny', 'wrapper app.js deleguje kolektor i ma fallback', 'hasPotentialIntakeAlerts() pozostaje w app.js']
  }),
  Object.freeze({
    step: '8O-9e',
    status: 'done',
    scope: 'przygotowano seam calcEstimatedIntake(): input model, observed model, commit/clear window state i read-only snapshot; bez przenoszenia kalkulacji',
    risk: 'medium-high',
    candidateFunctions: ['buildEstimatedIntakeCalcInputModel', 'buildEstimatedIntakeLastObservedModel', 'commitEstimatedIntakeWindowState'],
    extractedFile: null,
    extractedIn: null,
    contract: 'estimated-intake-calc-seam',
    requiredSmokeTests: ['snapshot calc seam bez uruchamiania calcEstimatedIntake()', 'kontrakt VildaDeps estimated-intake-calc-seam']
  }),
  Object.freeze({
    step: '8O-9f',
    status: 'done',
    scope: 'wydzielono czysty model obliczeniowy estimated intake do VildaEstimatedIntake.buildEstimatedIntakeCalculationModel(); app.js zachowuje render DOM, commit window.* i risk checks',
    risk: 'medium-high',
    candidateFunctions: ['buildEstimatedIntakeCalculationModel'],
    extractedFile: 'vilda_estimated_intake.js',
    extractedIn: '8O-9f',
    contract: 'estimated-intake-calculation-model',
    requiredSmokeTests: ['VildaEstimatedIntake.buildEstimatedIntakeCalculationModel dostępny', 'wrapper app.js deleguje model i ma fallback', 'kontrakt VildaDeps estimated-intake-calculation-model']
  }),
  Object.freeze({
    step: '8O-T1',
    status: 'done',
    scope: 'dodano stały zestaw smoke testów regresyjnych: moduł browser API, runner Node, kontrakt VildaDeps i cache/service-worker wiring; bez zmian logiki obliczeniowej',
    risk: 'low',
    candidateFunctions: ['VildaSmokeTests.runRegressionSuite', 'vildaRunSmokeRegressionSuite', 'tools/smoke_regression_suite_node.js'],
    extractedFile: 'vilda_smoke_tests.js',
    extractedIn: '8O-T1',
    contract: 'regression-smoke-suite',
    requiredSmokeTests: ['node tools/smoke_regression_suite_node.js', 'kontrakt VildaDeps regression-smoke-suite', 'window.vildaRunSmokeRegressionSuite() w przeglądarce']
  }),
  Object.freeze({
    step: '8O-10a',
    status: 'done',
    scope: 'naprawiono truthiness walidacji liczbowej: jawnie wpisany wiek 0 lat jest akceptowany, puste pole wieku nadal nie oznacza noworodka',
    risk: 'medium',
    candidateFunctions: ['vildaIsFinitePositive', 'vildaIsFiniteNonNegative', 'vildaGetNumericValidationAuditSnapshot'],
    extractedFile: null,
    extractedIn: null,
    contract: 'numeric-validation-age-zero',
    requiredSmokeTests: ['kontrakt VildaDeps numeric-validation-age-zero', 'smoke suite numeric-validation-age-zero']
  }),
  Object.freeze({
    step: '8O-10b',
    status: 'done',
    scope: 'usunięto fallback pediatrycznej klasyfikacji BMI do progów dorosłych przy braku percentyla dziecięcego',
    risk: 'medium-high',
    candidateFunctions: ['bmiCategoryChild', 'vildaResolvePediatricBmiCategoryFromPercentile', 'toNormalBMITarget'],
    extractedFile: null,
    extractedIn: null,
    contract: 'pediatric-bmi-no-adult-fallback',
    requiredSmokeTests: ['kontrakt VildaDeps pediatric-bmi-no-adult-fallback', 'smoke suite pediatric-bmi-no-adult-fallback']
  }),
  Object.freeze({
    step: '8O-10c',
    status: 'done',
    scope: 'dodano kolejkę pending dla nutritionNormsModelUpdated w vilda_food_summary.js; szybkie odmienne zdarzenie podczas refreshu jest wykonywane po zakończeniu bieżącego refreshu',
    risk: 'medium',
    candidateFunctions: ['macroPracticeInitNutritionNormsRefresh', 'macroPracticeGetNutritionNormsRefreshQueueSnapshot'],
    extractedFile: 'vilda_food_summary.js',
    extractedIn: '8O-10c',
    contract: 'nutrition-norms-refresh-queue',
    requiredSmokeTests: ['kontrakt VildaDeps nutrition-norms-refresh-queue', 'dynamiczny smoke kolejki nutritionNormsModelUpdated', 'window.vildaGetNutritionNormsRefreshQueueSnapshot()']
  })
]);

const VILDA_ADVANCED_GROWTH_RISK_SUMMARY = Object.freeze({
  step: '8O-T1',
  status: 'regression-smoke-suite-installed',
  highestRiskAreas: Object.freeze([
    'calculateGrowthAdvanced() przeniesiony do VildaAdvancedGrowth, ale nadal zależny od wrappera app.js i lokalnych callbacków',
    'synchronizacja advanced ↔ intake ma helpery, operacje pojedynczego wiersza, parowanie list, handlery add/remove i event wiring delegowane do VildaAdvancedGrowth; smoke testy 8O-8g przechodzą, ale pełne E2E w przeglądarce nadal jest zalecane',
    'import punktów GH/IGF, bo duplikacja punktów jest trudna do wykrycia bez testu E2E',
    'raport pacjenta i PDF advanced growth, bo czytają helpery globalne oraz canvas/jsPDF/html2canvas',
    'collectIntakeRowsForAlertProbe() został wydzielony w 8O-9d-lite jako helper DI, ale hasPotentialIntakeAlerts() pozostaje domenowo sprzężona z DOM/PAL/anorexia risk/energy observed state',
    'czysty model obliczeniowy estimated intake został wydzielony w 8O-9f, ale render HTML, commit window.* i post-render risk checks nadal muszą pozostać kontrolowane w app.js',
    'kolejnym ryzykownym obszarem jest rozdzielenie rendererów HTML estimated intake bez zmiany calcEstimatedIntake(), setupEstimatedIntake() i intakeAddRow()'
  ]),
  manualRegressionChecklist: Object.freeze([
    'wpisać kilka pomiarów advanced i wygenerować raport wzrastania PDF',
    'zaimportować JSON ze starszą historią advancedGrowthData i intakeHistory, następnie Wyczyść wszystkie pola i reload bez pustej karty Ostatni pomiar',
    'otworzyć/zamknąć kartę estimated intake i sprawdzić parowanie oraz add/remove wierszy',
    'sprawdzić import punktów GH/IGF bez duplikacji po ponownym wejściu na stronę',
    'wygenerować raport pacjenta z sekcją advanced growth i siatkami centylowymi'
  ]),
  recommendedNextStep: '8O-9g'
});

const VILDA_ADVANCED_INTAKE_SYNC_AUDIT = Object.freeze({
  step: '8O-8g',
  status: 'validation-complete',
  purpose: 'Końcowa walidacja refaktoru synchronizacji advanced growth ↔ estimated intake; po 8O-8g helpery, operacje pojedynczego wiersza, parowanie list, handlery add/remove i event wiring są delegowane do VildaAdvancedGrowth, a app.js zachowuje wrappery/callback adapters.',
  currentOwner: 'VildaAdvancedGrowth helpers + row-copy + pairing + add/remove handlers + event wiring, app.js wrappers/callback adapters',
  proposedNextOwner: '8O-9 estimated-intake card extraction',
  diagnosticApi: 'window.vildaGetAdvancedIntakeSyncAuditSnapshot(options)',
  protectedState: Object.freeze([
    'window.advancedGrowthData',
    'window.intakeHistory',
    'window.__vildaSuspendAdvIntakeSync',
    'data-adv-intake-sync-id',
    'data-gh-sync / data-gh-id dla wierszy GH/IGF'
  ]),
  coreFunctions: Object.freeze([
    '_intkRows',
    '_advRows',
    '_getIntakeHistoryRows',
    'VildaAdvancedGrowth.advIntakeGetIntakeRows',
    'VildaAdvancedGrowth.advIntakeGetAdvancedRows',
    'VildaAdvancedGrowth.advIntakeGetIntakeHistoryRows',
    '_isAdvIntakeSyncSuspended',
    '_runWithAdvIntakeSyncSuspended',
    '_nextAdvIntakeSyncId',
    '_getAdvIntakeSyncId',
    '_setAdvIntakeSyncId',
    'VildaAdvancedGrowth.advIntakeGetSyncId',
    'VildaAdvancedGrowth.advIntakeSetSyncId',
    '_findAdvRowBySyncId',
    '_findIntakeHistoryRowBySyncId',
    '_syncAdvRowToIntake',
    '_syncIntakeRowToAdv',
    'VildaAdvancedGrowth.syncAdvancedIntakeAdvancedRowToHistoryRow',
    'VildaAdvancedGrowth.syncAdvancedIntakeHistoryRowToAdvancedRow',
    'VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder',
    'VildaAdvancedGrowth.backfillAdvancedIntakeHistoryRowFromAdvancedRow',
    'VildaAdvancedGrowth.backfillAdvancedIntakeAdvancedRowFromHistoryRow',
    '_pairAdvancedAndIntakeRowsByOrder',
    'handleAdvancedMeasurementAdd',
    'handleIntakeHistoryAdd',
    'handleAdvancedMeasurementRowRemove',
    'handleIntakeHistoryRowRemove',
    'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementAdd',
    'VildaAdvancedGrowth.handleAdvancedIntakeHistoryAdd',
    'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementRowRemove',
    'VildaAdvancedGrowth.handleAdvancedIntakeHistoryRowRemove',
    'setupAdvancedIntakeLiveWiring',
    'VildaAdvancedGrowth.setupAdvancedIntakeLiveWiring'
  ]),
  sideEffectBoundaries: Object.freeze([
    'calculateGrowthAdvanced()',
    'debouncedIntakeCalc()',
    'updateRemoveButtons()',
    'updateIntakeRemoveButtons()',
    'addAdvMeasurementRow()',
    'intakeAddRow()',
    'row.remove()'
  ]),
  nonMoveUntilNextStep: Object.freeze([
    'rehydratacja JSON advanced/intake',
    'estimated intake card i calcEstimatedIntake()',
    'pełny cleanup wrapperów app.js przed wydzieleniem estimated intake card w 8O-9'
  ]),
  smokeTests: Object.freeze([
    'snapshot diagnostyczny działa bez mutowania DOM po delegacji do VildaAdvancedGrowth.advIntakeBuildAuditSnapshot()',
    'kontrakt VildaDeps advanced-growth-intake-sync-audit, helpers, row-operations, pairing, handlers i live-wiring przechodzą przy obecnych globalach',
    'wrappery add/remove i setupAdvancedIntakeLiveWiring() pozostają w app.js, a implementacje działają przez VildaAdvancedGrowth',
    'kontrakt VildaDeps advanced-growth-intake-sync-final-validation przechodzi przy obecnych globalach',
    'JSON → Wyczyść wszystkie pola → reload pozostaje bez regresji',
    'GH/IGF import nie duplikuje wierszy advanced'
  ]),
  nextStep: '8O-9'
});


const VILDA_ESTIMATED_INTAKE_CARD_AUDIT = Object.freeze({
  step: '8O-9f',
  status: 'calculation-model-extracted',
  purpose: 'Read-only audyt karty estimated intake po wydzieleniu czystego modelu obliczeniowego do vilda_estimated_intake.js; app.js zachowuje renderowanie, commit window.* i decyzje alertowe.',
  diagnosticApi: 'window.vildaGetEstimatedIntakeAuditSnapshot(options)',
  contract: 'estimated-intake-card-audit',
  helperContract: 'estimated-intake-card-helpers',
  alertProbeContract: 'estimated-intake-alert-probe-audit',
  alertProbeCollectorContract: 'estimated-intake-alert-probe-collector',
  calcSeamDiagnosticApi: 'window.vildaGetEstimatedIntakeCalcSeamSnapshot(options)',
  calcSeamContract: 'estimated-intake-calc-seam',
  calculationModelContract: 'estimated-intake-calculation-model',
  protectedState: Object.freeze([
    'window.intakeHistory',
    'window.intakeEstimatedKcalPerDay',
    'window.advancedGrowthData',
    'data-adv-intake-sync-id',
    'rehydratacja JSON advanced/intake',
    'synchronizacja advanced growth ↔ estimated intake'
  ]),
  currentOwner: 'vilda_estimated_intake.js neutral helpers + alert-probe collector + pure calculation model; app.js wrappers/render/commit/alert decision',
  proposedNextOwner: '8O-T1 smoke regression suite before more estimated-intake extraction',
  delegatedInStep: '8O-9b',
  alertProbeReviewedInStep: '8O-9c',
  alertProbeCollectorDelegatedInStep: '8O-9d-lite',
  calcSeamPreparedInStep: '8O-9e',
  calcModelDelegatedInStep: '8O-9f',
  delegatedHelpers: Object.freeze([
    'readIntakeRows',
    'getIntakeRowHeight',
    'buildIntakeIntervals',
    'collectIntakeRowsForAlertProbe',
    'buildEstimatedIntakeCalculationModel'
  ]),
  keepInAppJsInNextStep: Object.freeze([
    'calcEstimatedIntake',
    'setupEstimatedIntake',
    'intakeAddRow',
    'intakeAutofill',
    'resetIntakeCard',
    'hasPotentialIntakeAlerts',
    'renderowanie DOM estimated intake',
    'window.intakeHistory',
    'window.intakeEstimatedKcalPerDay'
  ]),
  smokeTests: Object.freeze([
    'window.vildaGetEstimatedIntakeAuditSnapshot({ includeRows: true }) działa bez mutacji DOM',
    'kontrakt VildaDeps estimated-intake-card-audit przechodzi',
    'kontrakt VildaDeps estimated-intake-card-helpers przechodzi',
    'VildaEstimatedIntake.readIntakeRows/getIntakeRowHeight/buildIntakeIntervals są dostępne',
    'VildaEstimatedIntake.collectIntakeRowsForAlertProbe jest dostępny',
    'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel jest dostępny',
    'calcEstimatedIntake() korzysta z modelu, ale nadal renderuje i commituje w app.js',
    'kontrakt VildaDeps estimated-intake-calculation-model przechodzi'
  ]),
  nextStep: '8O-T1'
});

const VILDA_ESTIMATED_INTAKE_ALERT_PROBE_AUDIT = Object.freeze({
  step: '8O-9f',
  status: 'collector-extracted-alert-decision-kept-calculation-model-extracted',
  purpose: 'Status funkcji alertowych estimated intake po wydzieleniu collectIntakeRowsForAlertProbe() i czystego modelu obliczeniowego; hasPotentialIntakeAlerts() pozostaje w app.js.',
  diagnosticApi: 'window.vildaGetEstimatedIntakeAlertProbeAuditSnapshot(options)',
  parentDiagnosticApi: 'window.vildaGetEstimatedIntakeAuditSnapshot(options).alertProbe',
  contract: 'estimated-intake-alert-probe-audit',
  collectorContract: 'estimated-intake-alert-probe-collector',
  calculationModelContract: 'estimated-intake-calculation-model',
  executedAlertProbeFunctions: false,
  candidateFunctions: Object.freeze([
    'collectIntakeRowsForAlertProbe',
    'hasPotentialIntakeAlerts'
  ]),
  dependencyAssessment: Object.freeze({
    collectIntakeRowsForAlertProbe: Object.freeze({
      classification: 'read-model collector',
      extractionReadiness: 'extracted-with-dependency-injection',
      dependencies: Object.freeze(['getUserBasics', 'readIntakeRows', 'getIntakeRowHeight', 'window.advancedGrowthData.measurements']),
      recommendation: 'Wydzielony w 8O-9d-lite jako helper DI; utrzymać wrapper/fallback app.js.'
    }),
    hasPotentialIntakeAlerts: Object.freeze({
      classification: 'domain alert decision',
      extractionReadiness: 'not-neutral-yet',
      dependencies: Object.freeze(['getUserBasics', 'DOM PAL', 'energyBuildIntakeObservedState', 'buildIntakeIntervals', 'detectAnRisk', 'has12mLossOrangeRisk']),
      recommendation: 'Nie przenosić jeszcze; po 8O-9f poczekać na rozdzielenie rendererów/post-render risk boundary i dopiero potem wydzielać decyzję alertową.'
    })
  }),
  protectedState: Object.freeze([
    'calcEstimatedIntake()',
    'setupEstimatedIntake()',
    'intakeAddRow()',
    'window.intakeHistory',
    'window.intakeEstimatedKcalPerDay',
    'JSON/rehydratacja',
    'advanced growth ↔ estimated intake sync'
  ]),
  smokeTests: Object.freeze([
    'window.vildaGetEstimatedIntakeAlertProbeAuditSnapshot() istnieje',
    'snapshot ma readOnly=true i executedAlertProbeFunctions=false',
    'snapshot pokazuje dependencyMap oraz sourceSignals',
    'kontrakt VildaDeps estimated-intake-alert-probe-audit przechodzi',
    'collectIntakeRowsForAlertProbe() działa przez wrapper app.js i VildaEstimatedIntake.collectIntakeRowsForAlertProbe',
    'hasPotentialIntakeAlerts() nadal jest w app.js'
  ]),
  recommendedNextStep: '8O-T1',
  preferredNextStep: '8O-T1 — stały zestaw smoke testów regresyjnych przed dalszym przenoszeniem rendererów lub logiki alertów estimated intake'
});

const VILDA_ESTIMATED_INTAKE_CALC_SEAM_AUDIT = Object.freeze({
  step: '8O-9f',
  status: 'calculation-model-extracted',
  purpose: 'Seam calcEstimatedIntake() po delegacji czystego modelu obliczeniowego: input model i observed model pozostają adapterami app.js, model buduje gałąź/commitPlan/postRenderRiskPlan, a render i efekty uboczne pozostają w app.js.',
  diagnosticApi: 'window.vildaGetEstimatedIntakeCalcSeamSnapshot(options)',
  parentDiagnosticApi: 'window.vildaGetEstimatedIntakeAuditSnapshot(options).calcSeam',
  contract: 'estimated-intake-calc-seam',
  calculationModelContract: 'estimated-intake-calculation-model',
  preparedHelpers: Object.freeze([
    'buildEstimatedIntakeCalcInputModel',
    'buildEstimatedIntakeLastObservedModel',
    'buildEstimatedIntakeCalculationModel',
    'buildEstimatedIntakeCalculationModelFallback',
    'buildEstimatedIntakeHistoryForRisk',
    'buildEstimatedIntakeWindowHistory',
    'getEstimatedIntakeCalcOutputTargets',
    'commitEstimatedIntakeWindowState',
    'clearEstimatedIntakeWindowState',
    'commitEstimatedIntakeCalcModelWindowState',
    'runEstimatedIntakePostRenderRisk'
  ]),
  readOnlySnapshotPolicy: Object.freeze([
    'nie uruchamia calcEstimatedIntake()',
    'nie uruchamia energyBuildIntakeObservedState()',
    'nie uruchamia buildIntakeIntervals()',
    'nie renderuje DOM',
    'nie zapisuje window.intakeHistory ani window.intakeEstimatedKcalPerDay',
    'pokazuje status calcModel bez wykonywania modelu'
  ]),
  sideEffectBoundaries: Object.freeze([
    'intakeUpdatePalDesc()',
    'vildaAppSetTrustedHtml(res, ...)',
    'legendEl.style.display',
    'window.intakeHistory / window.intakeEstimatedKcalPerDay',
    'energyBuildIntakeObservedState(... mountId=intakeResults)',
    'window.check12mLossOrange(...)'
  ]),
  keepInAppJs: Object.freeze([
    'calcEstimatedIntake',
    'hasPotentialIntakeAlerts',
    'setupEstimatedIntake',
    'intakeAddRow',
    'renderowanie wyników estimated intake',
    'JSON/rehydratacja',
    'advanced growth ↔ estimated intake sync'
  ]),
  smokeTests: Object.freeze([
    'window.vildaGetEstimatedIntakeCalcSeamSnapshot() istnieje',
    'snapshot ma readOnly=true i executedCalcEstimatedIntake=false',
    'snapshot pokazuje calcModel bez uruchamiania modelu',
    'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel jest dostępny',
    'kontrakt VildaDeps estimated-intake-calc-seam przechodzi',
    'kontrakt VildaDeps estimated-intake-calculation-model przechodzi',
    'calcEstimatedIntake() nadal jest w app.js i używa modelu do branch/commitPlan/postRenderRiskPlan'
  ]),
  recommendedNextStep: '8O-T1',
  preferredNextStep: '8O-T1 — stały zestaw smoke testów regresyjnych dla estimated intake, kontraktów VildaDeps i synchronizacji advanced ↔ intake'
});

const VILDA_ESTIMATED_INTAKE_CALCULATION_MODEL_AUDIT = Object.freeze({
  step: '8O-9f',
  status: 'calculation-model-extracted',
  purpose: 'Audyt delegacji czystego modelu obliczeniowego estimated intake do vilda_estimated_intake.js.',
  contract: 'estimated-intake-calculation-model',
  moduleApi: 'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel(inputModel, observedModel, dependencies)',
  diagnosticApi: 'window.vildaGetEstimatedIntakeCalculationModelSnapshot(options)',
  parentDiagnosticApi: 'window.vildaGetEstimatedIntakeAuditSnapshot(options).calculationModel',
  movedToModule: Object.freeze(['buildEstimatedIntakeCalculationModel']),
  appJsAdapters: Object.freeze([
    'buildEstimatedIntakeCalculationModel wrapper',
    'buildEstimatedIntakeCalculationModelFallback',
    'commitEstimatedIntakeCalcModelWindowState',
    'runEstimatedIntakePostRenderRisk'
  ]),
  keptInAppJs: Object.freeze([
    'calcEstimatedIntake()',
    'renderowanie DOM estimated intake',
    'commit window.intakeHistory/window.intakeEstimatedKcalPerDay',
    'hasPotentialIntakeAlerts()',
    'setupEstimatedIntake()',
    'intakeAddRow()'
  ]),
  sideEffectBoundaries: Object.freeze([
    'model zwraca commitPlan zamiast zapisywać window.*',
    'model zwraca postRenderRiskPlan zamiast uruchamiać risk-adjusted energy render',
    'model zwraca branch/interwały/single model zamiast renderować HTML'
  ]),
  smokeTests: Object.freeze([
    'VildaEstimatedIntake.VERSION === 1.2.0',
    'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel istnieje',
    'model dla 0/1/wielu wierszy nie renderuje DOM i nie zapisuje window.*',
    'app.js wrapper ma fallback',
    'kontrakt VildaDeps estimated-intake-calculation-model przechodzi'
  ]),
  recommendedNextStep: '8O-T1'
});

const VILDA_REGRESSION_SMOKE_SUITE_AUDIT = Object.freeze({
  step: '8O-T1',
  status: 'installed',
  purpose: 'Stały zestaw smoke testów regresyjnych po wydzieleniu części estimated intake; ma chronić wrappery, snapshoty, kontrakty, synchronizację advanced↔intake i cache przed dalszym refaktorem.',
  browserModule: 'vilda_smoke_tests.js',
  browserApi: 'window.VildaSmokeTests',
  browserRunApi: 'window.vildaRunSmokeRegressionSuite(options)',
  browserSnapshotApi: 'window.vildaGetSmokeRegressionSuiteSnapshot(options)',
  nodeRunner: 'tools/smoke_regression_suite_node.js',
  contract: 'regression-smoke-suite',
  readOnlyPolicy: Object.freeze([
    'nie uruchamia calcEstimatedIntake()',
    'nie renderuje DOM',
    'nie zapisuje window.intakeHistory ani window.intakeEstimatedKcalPerDay',
    'uruchamia wyłącznie czysty model VildaEstimatedIntake na danych mockowych',
    'snapshoty aplikacyjne wywołuje w trybie read-only'
  ]),
  coveredAreas: Object.freeze([
    'VildaEstimatedIntake API surface',
    'czysty model estimated intake: 0/1/wiele wierszy',
    'snapshoty estimated intake',
    'kontrakty VildaDeps estimated intake',
    'powierzchnia advanced growth ↔ estimated intake sync',
    'cache busting i kolejność skryptów',
    'walidacja age=0',
    'pediatryczne BMI bez fallbacku dorosłego',
    'kolejka refreshy nutritionNormsModelUpdated w food-summary'
  ]),
  smokeTests: Object.freeze([
    'node tools/smoke_regression_suite_node.js',
    'window.vildaRunSmokeRegressionSuite()',
    'window.vildaGetSmokeRegressionSuiteSnapshot()',
    'kontrakt VildaDeps regression-smoke-suite przechodzi'
  ]),
  recommendedNextStep: '8O-10d-a — przygotowanie registry hooków update bez przepinania istniejących wrapperów'
});



const VILDA_NUTRITION_NORMS_REFRESH_QUEUE_AUDIT = Object.freeze({
  step: '8O-10c',
  status: 'installed',
  purpose: 'Stabilizacja refreshu food-summary po zdarzeniu nutritionNormsModelUpdated: szybkie odmienne zdarzenie odebrane podczas trwającego refreshu jest zapisywane jako pending i wykonywane po zakończeniu bieżącego refreshu.',
  ownerModule: 'vilda_food_summary.js',
  browserApi: 'window.vildaGetNutritionNormsRefreshQueueSnapshot(options)',
  moduleApi: 'window.VildaFoodSummary.getNutritionNormsRefreshQueueSnapshot(options)',
  contract: 'nutrition-norms-refresh-queue',
  protectedAreas: Object.freeze([
    'macroPracticeRefreshFoodCardOnly()',
    'macroPracticeUpdateFoodSummary()',
    'patientReportBuildNutritionNormsModelFromCurrentState()',
    'nutrition_norms.js dispatch nutritionNormsModelUpdated',
    'obliczenia norm żywieniowych i planowania makro'
  ]),
  queuePolicy: Object.freeze([
    'duplikat już wykonanej sygnatury jest ignorowany',
    'odmienne zdarzenie podczas refreshing=true trafia do pendingSignature',
    'kilka pending eventów jest koalescowanych do najnowszej sygnatury',
    'po zwolnieniu bieżącego refreshu pendingSignature uruchamia następny refresh',
    'snapshot diagnostyczny jest read-only i nie wywołuje refreshu'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps nutrition-norms-refresh-queue',
    'node tools/smoke_regression_suite_node.js dynamic: nutrition-norms-refresh-queue-dynamic',
    'window.vildaRunSmokeRegressionSuite() zawiera test nutrition-norms-refresh-queue'
  ]),
  recommendedNextStep: '8O-10d-c'
});

const VILDA_UPDATE_HOOKS_REGISTRY_AUDIT = Object.freeze({
  step: '8O-10d-a',
  status: 'installed',
  purpose: 'Przygotowanie registry hooków wykonywanych po update(), aby kolejne kroki mogły usuwać monkey-patching window.update pojedynczo i z kontrolą kolejności.',
  ownerModule: 'vilda_update_hooks.js',
  browserApi: 'window.VildaUpdateHooks',
  snapshotApi: 'window.vildaGetUpdateHooksSnapshot(options) / window.vildaGetUpdateHooksAuditSnapshot(options)',
  contract: 'update-hooks-registry',
  readOnlyPolicy: Object.freeze([
    'snapshot registry nie uruchamia update()',
    'moduł nie przepina window.update w kroku 8O-10d-a',
    'moduł nie zmienia kolejności istniejących wrapperów window.update',
    'testowy run hooków uruchamia tylko jawnie zarejestrowane hooki registry'
  ]),
  apiSurface: Object.freeze([
    'registerAfterUpdateHook(fn, options)',
    'unregisterAfterUpdateHook(id)',
    'runAfterUpdateHooks(context, options)',
    'getSnapshot(options)',
    'getHookAuditSnapshot(options)',
    'getApiSurfaceStatus()'
  ]),
  protectedAreas: Object.freeze([
    'istniejące wrappery window.update w app.js',
    'wrapper window.update w vilda_diet_recommendations.js',
    'kolejność dotychczasowego update() i hooków UI',
    'VildaUpdatePrep.runMainUpdate()'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps update-hooks-registry',
    'node tools/smoke_regression_suite_node.js: VildaUpdateHooks.dynamic',
    'window.vildaRunSmokeRegressionSuite() zawiera test update-hooks-registry'
  ]),
  recommendedNextStep: '8O-10d-g — wykonane; następny etap to 8O-11a IndexedDB cleanup albo dalsze porządki zasobowe'
});


const VILDA_UPDATE_HOOKS_FIRST_WRAPPER_BRIDGE_AUDIT = Object.freeze({
  step: '8O-10d-b',
  status: 'installed',
  purpose: 'Pierwszy pojedynczy wrapper window.update w app.js został przepięty na VildaUpdateHooks jako hook BMI p50; app.js instaluje bridge uruchamiający registry po poprzednim update().',
  ownerFiles: Object.freeze(['app.js', 'vilda_update_hooks.js']),
  browserApi: 'window.vildaGetUpdateHooksBridgeSnapshot(options)',
  registryApi: 'window.VildaUpdateHooks.getSnapshot(options)',
  migratedWrapperId: 'app:bmi50-info-after-update',
  migratedFunction: 'updateBmi50InfoAfterUpdate(context)',
  contract: 'update-hooks-first-wrapper-bridge',
  protectedAreas: Object.freeze([
    'kolejność dotychczasowego łańcucha window.update',
    'drugi wrapper app.js updateIdealWeightUI()',
    'wrapper vilda_diet_recommendations.js updateDietRecommendationsVisibility() — przepięty w 8O-10d-d',
    'główne obliczenia update()',
    'VildaUpdatePrep.runMainUpdate()'
  ]),
  policy: Object.freeze([
    'bridge wywołuje poprzedni window.update przed runAfterUpdateHooks()',
    'BMI p50 info jest zarejestrowane jako hook registry z id app:bmi50-info-after-update',
    'hook wykonuje realny DOM update tylko dla context.source=window.update/window.update-fallback',
    'bezpośredni smoke run registry nie powinien mutować DOM przez hook BMI p50',
    'kolejne wrappery pozostają do etapów 8O-10d-c i dalszych'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps update-hooks-first-wrapper-bridge',
    'smoke suite update-hooks-first-wrapper-bridge',
    'node tools/smoke_regression_suite_node.js: update-hooks-first-wrapper-bridge-static'
  ]),
  recommendedNextStep: '8O-10d-g — wykonane; następny etap to 8O-11a IndexedDB cleanup albo dalsze porządki zasobowe'
});


const VILDA_UPDATE_HOOKS_SECOND_WRAPPER_BRIDGE_AUDIT = Object.freeze({
  step: '8O-10d-c',
  status: 'installed',
  purpose: 'Drugi pojedynczy wrapper window.update w app.js został przepięty na VildaUpdateHooks jako hook updateIdealWeightUI wykonywany po hooku BMI p50.',
  ownerFiles: Object.freeze(['app.js', 'vilda_update_hooks.js']),
  browserApi: 'window.vildaGetUpdateHooksBridgeSnapshot(options)',
  registryApi: 'window.VildaUpdateHooks.getSnapshot(options)',
  migratedWrapperIds: Object.freeze(['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update']),
  migratedFunction: 'updateIdealWeightUIAfterUpdate(context)',
  contract: 'update-hooks-second-wrapper-bridge',
  protectedAreas: Object.freeze([
    'kolejność dotychczasowego łańcucha window.update',
    'wrapper vilda_diet_recommendations.js updateDietRecommendationsVisibility() — przepięty w 8O-10d-d',
    'główne obliczenia update()',
    'VildaUpdatePrep.runMainUpdate()',
    'obliczenia BMI/BMR/centyli',
    'raporty PDF/HTML'
  ]),
  policy: Object.freeze([
    'bridge pozostaje jeden i wywołuje poprzedni window.update przed runAfterUpdateHooks()',
    'hook BMI p50 ma order=10',
    'hook updateIdealWeightUI ma order=20',
    'smoke run registry z source innym niż window.update nie mutuje DOM przez przepięte hooki',
    'kolejny wrapper został przepięty w etapie 8O-10d-d'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps update-hooks-second-wrapper-bridge',
    'smoke suite update-hooks-second-wrapper-bridge',
    'node tools/smoke_regression_suite_node.js: update-hooks-second-wrapper-bridge-static'
  ]),
  recommendedNextStep: '8O-10d-g — wykonane; następny etap to 8O-11a IndexedDB cleanup albo dalsze porządki zasobowe'
});


const VILDA_UPDATE_HOOKS_DIET_RECOMMENDATIONS_WRAPPER_AUDIT = Object.freeze({
  step: '8O-10d-d',
  status: 'installed',
  purpose: 'Wrapper window.update w vilda_diet_recommendations.js został przepięty na VildaUpdateHooks jako hook updateDietRecommendationsVisibility wykonywany po hookach app.js.',
  ownerFiles: Object.freeze(['vilda_diet_recommendations.js', 'vilda_update_hooks.js', 'app.js']),
  browserApi: 'window.vildaGetDietRecommendationsUpdateHookSnapshot(options)',
  registryApi: 'window.VildaUpdateHooks.getSnapshot(options)',
  migratedWrapperIds: Object.freeze(['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update', 'diet:recommendations-visibility-after-update']),
  migratedFunction: 'updateDietRecommendationsVisibilityAfterUpdate(context)',
  contract: 'update-hooks-diet-recommendations-wrapper',
  protectedAreas: Object.freeze([
    'logika zaleceń dietetycznych i warunki widoczności przycisku',
    'główne obliczenia update()',
    'VildaUpdatePrep.runMainUpdate()',
    'kolejność hooków app.js: BMI p50 przed ideal-weight UI',
    'raporty PDF/HTML i generowanie zaleceń'
  ]),
  policy: Object.freeze([
    'hook zaleceń dietetycznych ma order=30 i wykonuje się po hookach app.js order=10/20',
    'vilda_diet_recommendations.js nie nadpisuje już window.update, gdy VildaUpdateHooks jest dostępny',
    'snapshot hooka jest read-only i nie uruchamia window.update ani hooków',
    'source inny niż window.update/window.update-fallback jest traktowany jako dry-run/skip, aby smoke suite nie mutował DOM'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps update-hooks-diet-recommendations-wrapper',
    'smoke suite update-hooks-diet-recommendations-wrapper',
    'node tools/smoke_regression_suite_node.js: update-hooks-diet-recommendations-wrapper-static',
    'node tools/smoke_regression_suite_node.js: VildaUpdateHooks.bridge-aware-snapshot z hookiem diet'
  ]),
  recommendedNextStep: '8O-10d-g — wykonane; następny etap to 8O-11a IndexedDB cleanup albo dalsze porządki zasobowe'
});


const VILDA_UPDATE_HOOKS_FINAL_CHAIN_AUDIT = Object.freeze({
  step: '8O-10d-g',
  status: 'updated',
  purpose: 'Końcowy audyt łańcucha window.update po migracji znanych wrapperów 8O-10d oraz wrapperów nutrition_norms.js i nutrition_micros.js. Audyt potwierdza rejestrację hooków app.js, diet recommendations, nutrition norms i nutrition micros oraz brak znanych legacy-wrapperów update w tym torze.',
  ownerFiles: Object.freeze(['vilda_update_hooks.js', 'app.js', 'vilda_deps.js', 'vilda_smoke_tests.js']),
  browserApi: 'window.vildaGetFinalUpdateChainAuditSnapshot(options)',
  alternateBrowserApi: 'window.vildaGetUpdateHooksFinalChainAuditSnapshot(options)',
  registryApi: 'window.VildaUpdateHooks.getFinalUpdateChainAuditSnapshot(options)',
  contract: 'update-hooks-final-chain-audit',
  knownMigratedWrapperIds: Object.freeze(['app:bmi50-info-after-update', 'app:ideal-weight-ui-after-update', 'diet:recommendations-visibility-after-update', 'nutrition-norms:card-render-after-update', 'nutrition-micros:card-render-after-update']),
  expectedOrder: Object.freeze({
    'app:bmi50-info-after-update': 10,
    'app:ideal-weight-ui-after-update': 20,
    'diet:recommendations-visibility-after-update': 30,
    'nutrition-norms:card-render-after-update': 40,
    'nutrition-micros:card-render-after-update': 50
  }),
  outOfScopeWrappersDetectedByAudit: Object.freeze([]),
  protectedAreas: Object.freeze([
    'główne obliczenia update()',
    'VildaUpdatePrep.runMainUpdate()',
    'kolejność hooków po update(): BMI p50 → ideal weight UI → diet recommendations → nutrition norms → nutrition micros',
    'food summary i micronorms — bez zmiany obliczeń; oba moduły nutrition są obsługiwane przez VildaUpdateHooks',
    'estimated intake, advanced growth, JSON i raporty PDF/HTML'
  ]),
  policy: Object.freeze([
    'snapshot końcowy nie wywołuje window.update()',
    'snapshot końcowy nie uruchamia hooków registry',
    'snapshot końcowy nie renderuje DOM i nie zapisuje window.*',
    'znane wrappery 8O-10d-g są uznane za domknięte tylko przy obecnych hookach order=10/20/30/40/50',
    'snapshot końcowy raportuje brak znanych legacy-wrapperów window.update w torze 8O-10d'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps update-hooks-final-chain-audit',
    'smoke suite update-hooks-final-chain-audit',
    'node tools/smoke_regression_suite_node.js: update-hooks-final-chain-audit-static',
    'node tools/smoke_regression_suite_node.js: VildaUpdateHooks.final-chain-audit',
    'node tools/smoke_regression_suite_node.js: update-hooks-nutrition-norms-wrapper-static',
    'node tools/smoke_regression_suite_node.js: update-hooks-nutrition-micros-wrapper-static',
    'node tools/smoke_regression_suite_node.js: VildaNutritionMicros.update-hook'
  ]),
  recommendedNextStep: '8O-11a — IndexedDB cleanup albo dalsze porządki zasobowe'
});


const VILDA_UPDATE_HOOKS_NUTRITION_NORMS_MIGRATION = Object.freeze({
  step: '8O-10d-f',
  status: 'installed',
  purpose: 'Wrapper window.update w nutrition_norms.js został przepięty na VildaUpdateHooks jako hook renderowania karty norm żywieniowych, z zachowaniem kolejności po hookach app.js i diet recommendations.',
  ownerFiles: Object.freeze(['nutrition_norms.js', 'vilda_update_hooks.js', 'vilda_deps.js', 'vilda_smoke_tests.js']),
  browserApi: 'window.vildaGetNutritionNormsUpdateHookSnapshot(options)',
  localApi: 'window.nutritionNormsGetUpdateHookSnapshot(options)',
  contract: 'update-hooks-nutrition-norms-wrapper',
  migratedWrapperId: 'nutrition-norms:card-render-after-update',
  expectedOrder: 40,
  protectedAreas: Object.freeze([
    'obliczenia norm żywieniowych',
    'renderNutritionNormsCardFromDom() — bez zmian semantycznych',
    'nutrition_micros.js wrapper window.update — przepięty w 8O-10d-g jako osobny hook order=50',
    'główne update(), estimated intake, advanced growth, JSON i raporty'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps update-hooks-nutrition-norms-wrapper',
    'smoke suite update-hooks-nutrition-norms-wrapper',
    'node tools/smoke_regression_suite_node.js: update-hooks-nutrition-norms-wrapper-static',
    'node tools/smoke_regression_suite_node.js: update-hooks-nutrition-micros-wrapper-static',
    'node tools/smoke_regression_suite_node.js: VildaNutritionNorms.update-hook',
    'node tools/smoke_regression_suite_node.js: nutrition-norms-update-hook-dynamic'
  ]),
  recommendedNextStep: '8O-11a — IndexedDB cleanup albo dalsze porządki zasobowe'
});


const VILDA_UPDATE_HOOKS_NUTRITION_MICROS_MIGRATION = Object.freeze({
  step: '8O-10d-g',
  status: 'installed',
  purpose: 'Wrapper window.update w nutrition_micros.js został przepięty na VildaUpdateHooks jako hook renderowania karty mikroelementów, z zachowaniem kolejności po nutrition_norms.js.',
  ownerFiles: Object.freeze(['nutrition_micros.js', 'vilda_update_hooks.js', 'vilda_deps.js', 'vilda_smoke_tests.js']),
  browserApi: 'window.vildaGetNutritionMicrosUpdateHookSnapshot(options)',
  localApi: 'window.nutritionMicrosGetUpdateHookSnapshot(options)',
  contract: 'update-hooks-nutrition-micros-wrapper',
  migratedWrapperId: 'nutrition-micros:card-render-after-update',
  expectedOrder: 50,
  protectedAreas: Object.freeze([
    'obliczenia mikroelementów',
    'renderNutritionMicrosCardFromDom() — bez zmian semantycznych',
    'główne update(), estimated intake, advanced growth, JSON i raporty'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps update-hooks-nutrition-micros-wrapper',
    'smoke suite update-hooks-nutrition-micros-wrapper',
    'node tools/smoke_regression_suite_node.js: VildaNutritionMicros.update-hook',
    'node tools/smoke_regression_suite_node.js: VildaUpdateHooks.final-chain-audit'
  ]),
  recommendedNextStep: '8O-11a — IndexedDB cleanup albo dalsze porządki zasobowe'
});


const VILDA_CENTILE_CHART_HEADER_NAME_AUDIT = Object.freeze({
  step: '8O-10e',
  status: 'installed',
  purpose: 'Bugfix nagłówka PDF siatek centylowych: aktualne pola DOM oraz ostatnio edytowane pole imienia/nazwiska mają priorytet przed potencjalnie nieświeżym window.advancedGrowthData.name.',
  ownerModule: 'vilda_centile_chart_header.js',
  browserApi: 'window.VildaCentileChartHeader',
  snapshotApi: 'window.vildaGetCentileChartHeaderNameSnapshot(options)',
  contract: 'centile-chart-header-fresh-name',
  affectedPages: Object.freeze(['index.html', 'docpro.html']),
  protectedAreas: Object.freeze([
    'obliczenia advanced growth',
    'wiek kostny, MPH i wzrost rodziców',
    'historia pomiarów i markery siatek',
    'raporty PDF inne niż nagłówek siatek centylowych',
    'window.advancedGrowthData jako źródło markerów i danych wzrostowych'
  ]),
  policy: Object.freeze([
    'name z #advName/#basicGrowthName/#name jest preferowany przed window.advancedGrowthData.name',
    'ostatnio edytowane pole imienia/nazwiska wygrywa przy rozbieżnościach DOM',
    'window.advancedGrowthData.name pozostaje tylko fallbackiem',
    'snapshot jest read-only i nie generuje PDF',
    'moduł nie zmienia obliczeń wzrostowych ani markerów wykresu'
  ]),
  smokeTests: Object.freeze([
    'kontrakt VildaDeps centile-chart-header-fresh-name',
    'smoke suite centile-chart-header-fresh-name',
    'node tools/smoke_regression_suite_node.js: centile-chart-header-fresh-name-dynamic'
  ]),
  recommendedNextStep: '8O-10d-g — wykonane; następny etap to 8O-11a IndexedDB cleanup albo dalsze porządki zasobowe'
});

const VILDA_DATA_IMPORT_EXPORT_AUDIT = Object.freeze([
  Object.freeze({
    id: 'utility-shims-and-name-sync',
    label: 'Helpery DOM/liczbowe, tooltipy i synchronizacja imienia',
    appJsLines: '17735-17820',
    functions: ['q', 'num', 'val', 'getTip', 'migrateTitleToDataTip', 'syncNames'],
    touchesDomIds: ['name', 'advName', 'basicGrowthName', 'fullName'],
    dependencies: ['document.getElementById', 'showTooltip'],
    extractionPhase: '8L-1',
    extractionRisk: 'low',
    extractedIn: '8L-1',
    extractedFile: 'vilda_data_import_export.js',
    keepGlobalApi: ['window.syncNames', 'window.VildaDataImportExport'],
    recommendation: 'Wydzielone w 8L-1 jako neutralna warstwa pomocnicza; app.js zachowuje lokalne aliasy i wrapper window.syncNames.'
  }),
  Object.freeze({
    id: 'data-sanitizers',
    label: 'Sanityzacja danych wzrastania i historii spożycia',
    appJsLines: '17821-18010',
    functions: ['normalizePersistNumber', 'normalizeAgeMonthsValue', 'sanitizeAdvancedMeasurementEntries', 'sanitizeAdvancedRowsUI', 'normalizeIntakeCurrentBasics', 'intakeHistoryEntryMatchesCurrentBasics', 'sanitizeIntakeHistoryEntries', 'sanitizeIntakeRowsUI'],
    dependencies: ['window.advancedGrowthData', 'window.intakeHistory'],
    extractionPhase: '8L-1',
    extractionRisk: 'low-medium',
    extractedIn: '8L-1',
    extractedFile: 'vilda_data_import_export.js',
    keepGlobalApi: ['window.VildaDataImportExport'],
    recommendation: 'Wydzielone w 8L-1. Sanityzatory są testowalne poza app.js i nadal dostępne dla app.js przez lokalne aliasy.'
  }),
  Object.freeze({
    id: 'silent-field-restore-and-mode-restore',
    label: 'Ciche ustawianie pól oraz przywracanie trybów wyników/źródeł danych',
    appJsLines: '18011-18155',
    functions: ['setFieldValueSilently', 'setCheckboxValueSilently', 'applyResultsModeRestoreState', 'applyDataSourceRestoreState'],
    touchesDomIds: ['resultsModeToggle', 'dataToggleContainer'],
    dependencies: ['window.professionalMode', 'window.applyThemeCustom', 'toggleAdultVitalsSourceInputs', 'updateGrowthDataSourceControls'],
    extractionPhase: '8L-3',
    extractionRisk: 'medium',
    extractedIn: '8L-3',
    extractedFile: 'vilda_data_import_export.js',
    keepGlobalApi: ['window.setFieldValueSilently', 'window.setCheckboxValueSilently', 'window.applyResultsModeRestoreState', 'window.applyDataSourceRestoreState'],
    recommendation: 'Wydzielone w 8L-3. app.js zachowuje cienkie wrappery i przekazuje lokalne callbacki, żeby nie wywoływać lawiny eventów input/change podczas restore.'
  }),
  Object.freeze({
    id: 'growth-intake-rehydration',
    label: 'Rehydratacja zaawansowanego wzrastania, basic growth i intake',
    appJsLines: '18156-18510',
    functions: ['withHistoryRestoreGuards', 'rehydrateAdvancedFromState', 'rehydrateAdvancedRowsUIFromState', 'rehydrateIntakeFromState'],
    touchesDomIds: ['advMeasurements', 'basicGrowthMeasurements', 'intakeMeasurements', 'toggleIntakeCard', 'intakeCard', 'intakePal'],
    dependencies: ['addMeasurementRow', 'addBasicGrowthMeasurementRow', 'refreshEstimatedIntakeVisibility', 'vildaEnsureAdvancedIntakePairing', 'window.advancedGrowthData', 'window.basicGrowthData', 'window.intakeHistory'],
    extractionPhase: '8L-4',
    extractionRisk: 'high',
    extractedIn: '8L-4',
    extractedFile: 'vilda_data_import_export.js',
    keepGlobalApi: ['window.vildaRehydrateAdvancedFromState', 'window.vildaRehydrateAdvancedRowsUI', 'window.vildaRehydrateIntakeFromState'],
    recommendation: 'Wydzielone w 8L-4. app.js zachowuje cienkie wrappery i przekazuje lokalne callbacki dla advanced/intake, bez ruszania applyLoadedData() ani autosave.'
  }),
  Object.freeze({
    id: 'button-state-and-session-persistence',
    label: 'Stan przycisków zapisu/wczytywania oraz autosave sesji głównej',
    appJsLines: '18511-18910',
    functions: ['anyDataEntered', 'updateSaveBtnVisibility', 'maybeDisableLoadIfNeeded', 'getVildaPersistenceAdapter', 'hasMainSessionStorage', 'isMainSessionAutosavePaused', 'clearMainSessionStorage', 'saveMainSessionNow', 'scheduleMainSessionSave', 'finalizeMainSessionRestore', 'restoreMainSessionIfAny', 'attachMainSessionClearHandler', 'initMainSessionPersistence'],
    touchesDomIds: ['saveDataBtn', 'saveDataBtnSidebar', 'loadDataBtn', 'loadDataBtnSidebar', 'restoreStateBtn', 'clcrForm', 'clearAllDataBtn', 'clearBtn'],
    dependencies: ['VildaPersistence.readMainSession', 'VildaPersistence.writeMainSession', 'VildaPersistence.clearMainSession', 'collectUserData', 'applyLoadedData'],
    extractionPhase: '8L-5',
    extractedIn: '8L-5',
    extractedFile: 'vilda_data_import_export.js',
    extractionRisk: 'done',
    keepGlobalApi: ['window.vildaSession'],
    recommendation: 'Wydzielone w 8L-5 do VildaDataImportExport. app.js zachowuje cienkie wrappery oraz przekazuje collectUserData() i applyLoadedData() jako callbacki.'
  }),
  Object.freeze({
    id: 'json-export',
    label: 'Budowanie modelu eksportu JSON i pobieranie pliku',
    appJsLines: '18911-19220',
    functions: ['collectUserData', 'sanitizeFilename', 'saveUserData'],
    dependencies: ['VildaPersistence.readClcrSession', 'window.ghTherapyPoints', 'window.advancedGrowthData', 'window.basicGrowthData', 'window.intakeHistory', 'Blob', 'URL.createObjectURL'],
    extractionPhase: '8L-2',
    extractedIn: '8L-2',
    extractionRisk: 'done',
    keepGlobalApi: ['window.vildaExport.collectUserData', 'window.vildaExport.saveUserData'],
    recommendation: 'Wydzielone w 8L-2 do vilda_data_import_export.js; app.js zachowuje cienkie wrappery i window.vildaExport.'
  }),
  Object.freeze({
    id: 'clear-all-data',
    label: 'Globalne czyszczenie danych i reset modułów historii',
    appJsLines: '19221-19635',
    functions: ['resetGrowthHistoryModulesAfterClear', 'clearAllData'],
    touchesDomIds: ['advMeasurements', 'basicGrowthMeasurements', 'intakeMeasurements', 'loadDataBtn', 'restoreStateBtn', 'prevSummaryWrap', 'prevSummaryCard', 'togglePrevSummary'],
    dependencies: ['VildaPersistence.clearUserState', 'clearFields', 'resetClcrForm', 'calculateBasicGrowth', 'refreshGHTherapyMonitor'],
    extractionPhase: '8L-6a',
    extractedIn: '8L-6a',
    extractedFile: 'vilda_data_import_export.js',
    extractionRisk: 'done',
    keepGlobalApi: ['window.vildaExport.clearAllData', 'window.clearAllData'],
    recommendation: 'Wydzielone w 8L-6a do VildaDataImportExport. app.js zachowuje cienkie wrappery i przekazuje zależności resetu modułów jako callbacki.'
  }),
  Object.freeze({
    id: 'json-import-apply-loaded-data',
    label: 'Apply loaded data: pełne odtworzenie danych z pliku JSON',
    appJsLines: '19636-20470',
    functions: ['applyLoadedData', 'buildRows'],
    touchesDomIds: ['fileInput', 'loadDataBtn', 'name', 'advName', 'basicGrowthName', 'fullName', 'sex', 'age', 'ageMonths', 'weight', 'height', 'waistCm', 'hipCm'],
    dependencies: ['VildaDataImportExport.syncSharedUserDataFromLoadedData', 'VildaPersistence.writeClcrSession', 'addFoodRow', 'macroPracticeAnalyzeFoodSelection', 'update', 'debouncedUpdate'],
    extractionPhase: '8L-7c',
    partiallyExtractedIn: '8L-7b',
    extractedHelpers: ['normalizeSharedPersistRoot', 'syncSharedUserDataFromLoadedData'],
    extractionRisk: 'very-high',
    keepGlobalApi: ['window.vildaExport.applyLoadedData'],
    recommendation: 'handleFile()/FileReader wydzielone w 8L-7a, a synchronizacja sharedUserData w 8L-7b. Nadal nie przenosić applyLoadedData() w jednym kroku; po wydzieleniu wymaga ręcznego testu importu pliku z historią wzrastania, klirensem i food-row.'
  }),
  Object.freeze({
    id: 'json-wiring-and-disabled-ui',
    label: 'Wiring przycisków import/eksport oraz obsługa disabled tooltipów',
    appJsLines: '20471-20740',
    functions: ['initJsonDataImportExport', 'addDisabledTooltip'],
    touchesDomIds: ['loadDataBtn', 'saveDataBtn', 'fileInput', 'loadDataBtnSidebar', 'saveDataBtnSidebar', 'prevSummaryCard', 'prevSummaryWrap'],
    dependencies: ['migrateTitleToDataTip', 'showTooltip', 'saveUserData', 'handleFile', 'maybeDisableLoadIfNeeded'],
    extractionPhase: '8L-2',
    extractedIn: '8L-2',
    extractionRisk: 'done',
    keepGlobalApi: [],
    recommendation: 'Wydzielone w 8L-2 do VildaDataImportExport.initJsonDataImportExport(); init nadal uruchamia app.js przez vildaAppOnReady z callbackami.'
  }),
  Object.freeze({
    id: 'restore-loaded-state',
    label: 'restoreLoadedState() i przycisk przywracania stanu',
    appJsLines: '20741-21428',
    functions: ['showRestoreButton', 'restoreLoadedState', 'initRestoreStateButton'],
    touchesDomIds: ['restoreStateBtn', 'prevSummaryWrap', 'prevSummaryCard', 'togglePrevSummary', 'compareInstruction', 'name', 'advName', 'basicGrowthName', 'fullName'],
    dependencies: ['window.lastLoadedData', 'window.prevMeasurementInfo', 'setFieldValueSilently', 'rehydrateAdvancedFromState', 'rehydrateIntakeFromState', 'VildaPersistence.writeClcrSession', 'debouncedUpdate'],
    extractionPhase: '8L-6b',
    extractedIn: '8L-6b',
    extractedFile: 'vilda_data_import_export.js',
    extractionRisk: 'done',
    keepGlobalApi: ['window.restoreLoadedState', 'window.showRestoreButton'],
    recommendation: 'Wydzielone w 8L-6b do VildaDataImportExport. app.js zachowuje cienkie wrappery i przekazuje lokalne callbacki restore/rehydratacji.' 
  })
]);
const VILDA_DATA_IMPORT_EXPORT_EXTRACTION_PLAN = Object.freeze([
  Object.freeze({ step: '8L-1', status: 'done', scope: 'utworzono vilda_data_import_export.js i przeniesiono helpery neutralne oraz sanityzatory bez dotykania UI ani restore' }),
  Object.freeze({ step: '8L-2', status: 'done', scope: 'przeniesiono collectUserData(), saveUserData(), sanitizeFilename(), addDisabledTooltip() i initJsonDataImportExport() z zachowaniem wrapperów app.js oraz window.vildaExport' }),
  Object.freeze({ step: '8L-3', status: 'done', scope: 'przeniesiono ciche settery i restore trybu PRO / źródeł centyli bez uruchamiania pełnego applyLoadedData()' }),
  Object.freeze({ step: '8L-4', status: 'done', scope: 'przeniesiono rehydratację historii advanced/intake z zachowaniem globalnych aliasów vildaRehydrate* i wrapperów app.js' }),
  Object.freeze({ step: '8L-5', status: 'done', scope: 'przeniesiono stan przycisków zapisu/wczytywania i autosave sesji głównej, bez przenoszenia clearAllData()' }),
  Object.freeze({ step: '8L-6a', status: 'done', scope: 'przeniesiono clearAllData() i reset historii z zachowaniem wrapperów oraz callbacków app.js' }),
  Object.freeze({ step: '8L-6b', status: 'done', scope: 'przeniesiono restoreLoadedState(), showRestoreButton() i restoreStateBtn z zachowaniem wrapperów oraz callbacków app.js' }),
  Object.freeze({ step: '8L-7a', status: 'done', scope: 'przeniesiono handleFile(), walidację JSON i odczyt FileReader do VildaDataImportExport; applyLoadedData() pozostaje w app.js' }),
  Object.freeze({ step: '8L-7b', status: 'done', scope: 'wydzielono syncSharedUserDataFromLoadedData() i normalizeSharedPersistRoot() bez przenoszenia pełnego applyLoadedData()' }),
  Object.freeze({ step: '8L-7c', status: 'done', scope: 'wydzielono applyLoadedData() jako ostatnią wysokiego ryzyka część importu JSON' }),
  Object.freeze({ step: '8M', status: 'done', scope: 'audyt końcowy importu/eksportu JSON po wydzieleniu: sprawdzono wrappery, window.vildaExport, window.vildaSession, handleFile(), applyLoadedData(), restoreLoadedState(), clearAllData() i autosave bez dalszego przenoszenia dużej logiki' })
]);
const VILDA_DATA_IMPORT_EXPORT_RISK_SUMMARY = Object.freeze({
  appJsLines: '17735-21428',
  approxLines: 3694,
  approxBytes: 162239,
  functions: 49,
  uniqueDomIds: 73,
  jsonAndFileOperations: 28,
  currentGlobalExports: ['window.vildaExport', 'window.vildaSession', 'window.syncNames', 'window.handleFile', 'window.applyLoadedData', 'window.normalizeSharedPersistRoot', 'window.syncSharedUserDataFromLoadedData', 'window.VildaDataImportExport', 'window.vildaRehydrateAdvancedFromState', 'window.vildaRehydrateAdvancedRowsUI', 'window.vildaRehydrateIntakeFromState'],
  criticalRegressionScenarios: [
    'zapis JSON i zachowanie dotychczasowego schematu pliku',
    'wczytanie JSON z historią wzrastania, intake, GH/IGF i klirensem',
    'restoreStateBtn bez duplikowania poprzednich pomiarów',
    'clearAllDataBtn / clearBtn bez natychmiastowego odtworzenia danych przez autosave',
    'przejście między index/docpro/klirens po imporcie bez nadpisania sharedUserData'
  ]
});
const VILDA_DATA_IMPORT_EXPORT_FINAL_AUDIT = Object.freeze({
  step: '8M',
  status: 'done',
  appJsRole: 'wrapper-only',
  module: 'vilda_data_import_export.js',
  verifiedWrappers: ['window.vildaExport', 'window.vildaSession', 'window.handleFile', 'window.applyLoadedData', 'window.restoreLoadedState', 'window.clearAllData'],
  verifiedModuleFunctions: [
    'collectUserData',
    'saveUserData',
    'handleFile',
    'normalizeSharedPersistRoot',
    'syncSharedUserDataFromLoadedData',
    'applyLoadedData',
    'restoreLoadedState',
    'clearAllData',
    'saveMainSessionNow',
    'restoreMainSessionIfAny'
  ],
  smokeTests: [
    'eksport modelu danych',
    'import JSON przez handleFile() z file.text()',
    'applyLoadedData() z food-row, advancedGrowthData, intakeHistory, clcr i sharedUserData',
    'restoreLoadedState() z lastLoadedData',
    'window.vildaSession.saveNow()/restore()/clear()',
    'clearAllData() z adapterem VildaPersistence'
  ],
  residualRisk: [
    'pełne E2E w przeglądarce nadal wymagane dla plików użytkownika zapisanych w starszych wersjach',
    'raporty PDF i advanced growth są zależne od osobnych bibliotek globalnych'
  ],
  nextRecommendedStep: '8O-8'
});
const VILDA_UPDATE_ORCHESTRATOR_MAP = Object.freeze([
  Object.freeze({ order: 1, sectionId: 'entry-guards', helper: 'handleEntryGuard()', api: 'VildaUpdatePrep.handleEntryGuard', phase: 'guard', status: 'done' }),
  Object.freeze({ order: 2, sectionId: 'input-read', helper: 'readMainInputs()', api: 'VildaUpdatePrep.readMainInputs', phase: 'read', status: 'done' }),
  Object.freeze({ order: 3, sectionId: 'optional-modules', helper: 'runPreValidationSynchronizers()', api: 'VildaUpdatePrep.runPreValidationSynchronizers', phase: 'pre-validation', status: 'done' }),
  Object.freeze({ order: 4, sectionId: 'post-render', helper: 'preparePreValidationUi()', api: 'VildaUpdatePrep.preparePreValidationUi', phase: 'pre-validation-ui', status: 'done' }),
  Object.freeze({ order: 5, sectionId: 'validation', helper: 'handleInputValidation()', api: 'VildaUpdatePrep.handleInputValidation', phase: 'guard', status: 'done' }),
  Object.freeze({ order: 6, sectionId: 'bmi-normalization', helper: 'resetBmiNormalizationUi()', api: 'VildaUpdatePrep.resetBmiNormalizationUi', phase: 'pre-render-reset', status: 'done' }),
  Object.freeze({ order: 7, sectionId: 'food-summary', helper: 'updateFoodSummary()', api: 'VildaUpdatePrep.updateFoodSummary', phase: 'render', status: 'done' }),
  Object.freeze({ order: 8, sectionId: 'post-render', helper: 'resetResultContainers()', api: 'VildaUpdatePrep.resetResultContainers', phase: 'pre-render-reset', status: 'done' }),
  Object.freeze({ order: 9, sectionId: 'bmi-bmr', helper: 'computeBmiBmrState() + renderBmiBmrResults()', api: 'VildaUpdatePrep.computeBmiBmrState / renderBmiBmrResults', phase: 'compute-render', status: 'done' }),
  Object.freeze({ order: 10, sectionId: 'weight-height-centiles', helper: 'renderWeightHeightCentileCard()', api: 'VildaUpdatePrep.renderWeightHeightCentileCard', phase: 'render', status: 'done' }),
  Object.freeze({ order: 11, sectionId: 'child-metrics', helper: 'updateChildMetrics()', api: 'VildaUpdatePrep.updateChildMetrics', phase: 'render', status: 'done' }),
  Object.freeze({ order: 12, sectionId: 'bmi-normalization', helper: 'updateBmiNormalizationAndPlan()', api: 'VildaUpdatePrep.updateBmiNormalizationAndPlan', phase: 'render', status: 'done' }),
  Object.freeze({ order: 13, sectionId: 'food-summary', helper: 'updateFoodBurnSummary()', api: 'VildaUpdatePrep.updateFoodBurnSummary', phase: 'post-render', status: 'done' }),
  Object.freeze({ order: 14, sectionId: 'post-render', helper: 'completeMainUpdate()', api: 'VildaUpdatePrep.completeMainUpdate', phase: 'finish', status: 'done' })
]);
const VILDA_UPDATE_PUBLIC_ALIAS_MAP = Object.freeze([
  Object.freeze({ alias: 'vildaUpdateDiagnostics', target: 'VildaUpdatePrep.getDiagnostics', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateLastRun', target: 'VildaUpdatePrep.getLastRun', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateOrchestratorMap', target: 'VildaUpdatePrep.getOrchestratorMap', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpUpdateOrchestrator', target: 'VildaUpdatePrep.dumpOrchestratorMap', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaAppModularizationAudit', target: 'VildaUpdatePrep.getAppModularizationAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpAppModularizationAudit', target: 'VildaUpdatePrep.dumpAppModularizationAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaNextAppExtractionCandidate', target: 'VildaUpdatePrep.getNextExtractionCandidate', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDataImportExportAudit', target: 'VildaUpdatePrep.getDataImportExportAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpDataImportExportAudit', target: 'VildaUpdatePrep.dumpDataImportExportAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDataImportExportExtractionPlan', target: 'VildaUpdatePrep.getDataImportExportExtractionPlan', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaNextDataImportExportExtractionStep', target: 'VildaUpdatePrep.getNextDataImportExportExtractionStep', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDataImportExportRiskSummary', target: 'VildaUpdatePrep.getDataImportExportRiskSummary', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDataImportExportFinalAudit', target: 'VildaUpdatePrep.getDataImportExportFinalAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpDataImportExportFinalAudit', target: 'VildaUpdatePrep.dumpDataImportExportFinalAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaAdvancedGrowthBoundaryAudit', target: 'VildaUpdatePrep.getAdvancedGrowthBoundaryAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpAdvancedGrowthBoundaryAudit', target: 'VildaUpdatePrep.dumpAdvancedGrowthBoundaryAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaAdvancedGrowthExtractionPlan', target: 'VildaUpdatePrep.getAdvancedGrowthExtractionPlan', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaNextAdvancedGrowthExtractionStep', target: 'VildaUpdatePrep.getNextAdvancedGrowthExtractionStep', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaAdvancedGrowthRiskSummary', target: 'VildaUpdatePrep.getAdvancedGrowthRiskSummary', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaAdvancedIntakeSyncAudit', target: 'VildaUpdatePrep.getAdvancedIntakeSyncAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpAdvancedIntakeSyncAudit', target: 'VildaUpdatePrep.dumpAdvancedIntakeSyncAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaRegressionSmokeSuiteAudit', target: 'VildaUpdatePrep.getRegressionSmokeSuiteAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpRegressionSmokeSuiteAudit', target: 'VildaUpdatePrep.dumpRegressionSmokeSuiteAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaNutritionNormsRefreshQueueAudit', target: 'VildaUpdatePrep.getNutritionNormsRefreshQueueAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpNutritionNormsRefreshQueueAudit', target: 'VildaUpdatePrep.dumpNutritionNormsRefreshQueueAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateHooksRegistryAudit', target: 'VildaUpdatePrep.getUpdateHooksRegistryAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpUpdateHooksRegistryAudit', target: 'VildaUpdatePrep.dumpUpdateHooksRegistryAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateHooksFinalChainAudit', target: 'VildaUpdatePrep.getUpdateHooksFinalChainAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaDumpUpdateHooksFinalChainAudit', target: 'VildaUpdatePrep.dumpUpdateHooksFinalChainAudit', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateRunMain', target: 'VildaUpdatePrep.runMainUpdate', group: 'orchestrator', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateReadMainInputs', target: 'VildaUpdatePrep.readMainInputs', group: 'update-prep', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateValidateMainInputs', target: 'VildaUpdatePrep.validateMainInputs', group: 'update-prep', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateGetNumericValidationSnapshot', target: 'VildaUpdatePrep.getNumericValidationSnapshot', group: 'diagnostics', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateHandleEntryGuard', target: 'VildaUpdatePrep.handleEntryGuard', group: 'update-prep', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateHandleInputValidation', target: 'VildaUpdatePrep.handleInputValidation', group: 'update-prep', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateFoodSummary', target: 'VildaUpdatePrep.updateFoodSummary', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateFoodBurnSummary', target: 'VildaUpdatePrep.updateFoodBurnSummary', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateBmiBmrResults', target: 'VildaUpdatePrep.renderBmiBmrResults', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateWeightHeightCentileCard', target: 'VildaUpdatePrep.renderWeightHeightCentileCard', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateChildMetrics', target: 'VildaUpdatePrep.updateChildMetrics', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateBmiNormalizationAndPlan', target: 'VildaUpdatePrep.updateBmiNormalizationAndPlan', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateAdultMetrics', target: 'VildaUpdatePrep.updateAdultMetrics', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateGrowthDataSourceControls', target: 'VildaUpdatePrep.updateGrowthDataSourceControls', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdateOptionalSections', target: 'VildaUpdatePrep.runPreValidationSynchronizers', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'vildaUpdatePostRenderUi', target: 'VildaUpdatePrep.runPostRenderSynchronization', group: 'update-section', legacy: false }),
  Object.freeze({ alias: 'readMainInputs', target: 'VildaUpdatePrep.readMainInputs', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'validateMainInputs', target: 'VildaUpdatePrep.validateMainInputs', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'guardMainUpdatePage', target: 'VildaUpdatePrep.handleEntryGuard', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'handleMainInputValidation', target: 'VildaUpdatePrep.handleInputValidation', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updateFoodSummary', target: 'VildaUpdatePrep.updateFoodSummary', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updateBmiBmrResults', target: 'VildaUpdatePrep.renderBmiBmrResults', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updateWeightHeightCentileCard', target: 'VildaUpdatePrep.renderWeightHeightCentileCard', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updateChildMetrics', target: 'VildaUpdatePrep.updateChildMetrics', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updateBmiNormalizationAndPlan', target: 'VildaUpdatePrep.updateBmiNormalizationAndPlan', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updateAdultMetrics', target: 'VildaUpdatePrep.updateAdultMetrics', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updateGrowthDataSourceControls', target: 'VildaUpdatePrep.updateGrowthDataSourceControls', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updateOptionalSections', target: 'VildaUpdatePrep.runPreValidationSynchronizers', group: 'legacy-compat', legacy: true }),
  Object.freeze({ alias: 'updatePostRenderUi', target: 'VildaUpdatePrep.runPostRenderSynchronization', group: 'legacy-compat', legacy: true })
]);
let vildaUpdatePrepRunCounter = 0;
let vildaUpdatePrepLastRun = null;

function vildaUpdatePrepGetSectionMap() {
  return VILDA_UPDATE_SECTION_MAP.map((section) => Object.assign({}, section));
}

function vildaUpdatePrepGetRefactorPlan() {
  return VILDA_UPDATE_REFACTOR_PLAN.map((item) => Object.assign({}, item));
}

function vildaUpdatePrepGetAppModularizationAudit() {
  return VILDA_APP_MODULARIZATION_AUDIT.map((item) => Object.assign({}, item));
}

function vildaUpdatePrepGetNextExtractionCandidate() {
  return Object.assign({}, VILDA_APP_NEXT_EXTRACTION_CANDIDATE, {
    keepGlobals: VILDA_APP_NEXT_EXTRACTION_CANDIDATE.keepGlobals.slice(),
    prerequisites: VILDA_APP_NEXT_EXTRACTION_CANDIDATE.prerequisites.slice()
  });
}

function vildaUpdatePrepGetDataImportExportAudit() {
  return vildaUpdatePrepClonePlain(VILDA_DATA_IMPORT_EXPORT_AUDIT, 8);
}

function vildaUpdatePrepGetDataImportExportExtractionPlan() {
  return vildaUpdatePrepClonePlain(VILDA_DATA_IMPORT_EXPORT_EXTRACTION_PLAN, 5);
}

function vildaUpdatePrepGetDataImportExportRiskSummary() {
  return vildaUpdatePrepClonePlain(VILDA_DATA_IMPORT_EXPORT_RISK_SUMMARY, 6);
}

function vildaUpdatePrepGetDataImportExportFinalAudit() {
  return vildaUpdatePrepClonePlain(VILDA_DATA_IMPORT_EXPORT_FINAL_AUDIT, 6);
}

function vildaUpdatePrepDumpDataImportExportFinalAudit() {
  const audit = vildaUpdatePrepGetDataImportExportFinalAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.verifiedModuleFunctions || []).map((name) => ({ moduleFunction: name, checked: true })));
    }
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('Vilda 8M data import/export final audit', audit);
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') vildaLogAppWarn('VildaUpdatePrep.dumpDataImportExportFinalAudit', error);
  }
  return audit;
}

function vildaUpdatePrepGetAdvancedGrowthBoundaryAudit() {
  return vildaUpdatePrepClonePlain(VILDA_ADVANCED_GROWTH_BOUNDARY_AUDIT, 8);
}

function vildaUpdatePrepGetAdvancedGrowthExtractionPlan() {
  return vildaUpdatePrepClonePlain(VILDA_ADVANCED_GROWTH_EXTRACTION_PLAN, 6);
}

function vildaUpdatePrepGetAdvancedGrowthRiskSummary() {
  return vildaUpdatePrepClonePlain(VILDA_ADVANCED_GROWTH_RISK_SUMMARY, 6);
}

function vildaUpdatePrepGetNextAdvancedGrowthExtractionStep() {
  const plan = VILDA_ADVANCED_GROWTH_EXTRACTION_PLAN.find((item) => item && item.status !== 'done') || null;
  return plan ? vildaUpdatePrepClonePlain(plan, 5) : null;
}

function vildaUpdatePrepDumpAdvancedGrowthBoundaryAudit() {
  const audit = vildaUpdatePrepGetAdvancedGrowthBoundaryAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.submodules || []).map((item) => ({
        id: item.id,
        appJsLines: item.appJsLines,
        risk: item.risk,
        movePhase: item.movePhase,
        functions: Array.isArray(item.representativeFunctions) ? item.representativeFunctions.length : 0
      })));
    }
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log('Vilda 8N advanced growth boundary audit', audit);
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpAdvancedGrowthBoundaryAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetAdvancedIntakeSyncAudit() {
  return vildaUpdatePrepClonePlain(VILDA_ADVANCED_INTAKE_SYNC_AUDIT, 8);
}

function vildaUpdatePrepDumpAdvancedIntakeSyncAudit() {
  const audit = vildaUpdatePrepGetAdvancedIntakeSyncAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.coreFunctions || []).map((fn) => ({ functionName: fn, step: audit.step, owner: audit.currentOwner })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpAdvancedIntakeSyncAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetEstimatedIntakeCardAudit() {
  return vildaUpdatePrepClonePlain(VILDA_ESTIMATED_INTAKE_CARD_AUDIT, 8);
}

function vildaUpdatePrepDumpEstimatedIntakeCardAudit() {
  const audit = vildaUpdatePrepGetEstimatedIntakeCardAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.firstExtractionCandidates || []).map((fn) => ({ functionName: fn, step: audit.step, nextOwner: audit.proposedNextOwner })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpEstimatedIntakeCardAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetEstimatedIntakeAlertProbeAudit() {
  return vildaUpdatePrepClonePlain(VILDA_ESTIMATED_INTAKE_ALERT_PROBE_AUDIT, 8);
}

function vildaUpdatePrepDumpEstimatedIntakeAlertProbeAudit() {
  const audit = vildaUpdatePrepGetEstimatedIntakeAlertProbeAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.candidateFunctions || []).map((fn) => ({ functionName: fn, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpEstimatedIntakeAlertProbeAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetEstimatedIntakeCalcSeamAudit() {
  return vildaUpdatePrepClonePlain(VILDA_ESTIMATED_INTAKE_CALC_SEAM_AUDIT, 8);
}

function vildaUpdatePrepDumpEstimatedIntakeCalcSeamAudit() {
  const audit = vildaUpdatePrepGetEstimatedIntakeCalcSeamAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.preparedHelpers || []).map((fn) => ({ functionName: fn, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpEstimatedIntakeCalcSeamAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetEstimatedIntakeCalculationModelAudit() {
  return vildaUpdatePrepClonePlain(VILDA_ESTIMATED_INTAKE_CALCULATION_MODEL_AUDIT, 8);
}

function vildaUpdatePrepDumpEstimatedIntakeCalculationModelAudit() {
  const audit = vildaUpdatePrepGetEstimatedIntakeCalculationModelAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.appJsAdapters || []).map((name) => ({ adapter: name, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpEstimatedIntakeCalculationModelAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetRegressionSmokeSuiteAudit() {
  return vildaUpdatePrepClonePlain(VILDA_REGRESSION_SMOKE_SUITE_AUDIT, 8);
}

function vildaUpdatePrepDumpRegressionSmokeSuiteAudit() {
  const audit = vildaUpdatePrepGetRegressionSmokeSuiteAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.coveredAreas || []).map((area) => ({ area, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpRegressionSmokeSuiteAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetNutritionNormsRefreshQueueAudit() {
  return vildaUpdatePrepClonePlain(VILDA_NUTRITION_NORMS_REFRESH_QUEUE_AUDIT, 8);
}

function vildaUpdatePrepDumpNutritionNormsRefreshQueueAudit() {
  const audit = vildaUpdatePrepGetNutritionNormsRefreshQueueAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.queuePolicy || []).map((rule) => ({ rule, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpNutritionNormsRefreshQueueAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetUpdateHooksRegistryAudit() {
  return vildaUpdatePrepClonePlain(VILDA_UPDATE_HOOKS_REGISTRY_AUDIT, 8);
}

function vildaUpdatePrepDumpUpdateHooksRegistryAudit() {
  const audit = vildaUpdatePrepGetUpdateHooksRegistryAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.apiSurface || []).map((api) => ({ api, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpUpdateHooksRegistryAudit', error);
    }
  }
  return audit;
}


function vildaUpdatePrepGetUpdateHooksFirstWrapperBridgeAudit() {
  return vildaUpdatePrepClonePlain(VILDA_UPDATE_HOOKS_FIRST_WRAPPER_BRIDGE_AUDIT, 8);
}

function vildaUpdatePrepDumpUpdateHooksFirstWrapperBridgeAudit() {
  const audit = vildaUpdatePrepGetUpdateHooksFirstWrapperBridgeAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.policy || []).map((rule) => ({ rule, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpUpdateHooksFirstWrapperBridgeAudit', error);
    }
  }
  return audit;
}



function vildaUpdatePrepGetUpdateHooksFinalChainAudit() {
  return vildaUpdatePrepClonePlain(VILDA_UPDATE_HOOKS_FINAL_CHAIN_AUDIT, 8);
}

function vildaUpdatePrepDumpUpdateHooksFinalChainAudit() {
  const audit = vildaUpdatePrepGetUpdateHooksFinalChainAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.policy || []).map((rule) => ({ rule, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpUpdateHooksFinalChainAudit', error);
    }
  }
  return audit;
}


function vildaUpdatePrepGetCentileChartHeaderNameAudit() {
  return vildaUpdatePrepClonePlain(VILDA_CENTILE_CHART_HEADER_NAME_AUDIT, 8);
}

function vildaUpdatePrepDumpCentileChartHeaderNameAudit() {
  const audit = vildaUpdatePrepGetCentileChartHeaderNameAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table((audit.policy || []).map((rule) => ({ rule, step: audit.step, status: audit.status })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('VildaUpdatePrep.dumpCentileChartHeaderNameAudit', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetNextDataImportExportExtractionStep() {
  const plan = VILDA_DATA_IMPORT_EXPORT_EXTRACTION_PLAN.find((item) => item && item.status !== 'done') || null;
  return plan ? vildaUpdatePrepClonePlain(plan, 4) : null;
}

function vildaUpdatePrepDumpDataImportExportAudit() {
  const audit = vildaUpdatePrepGetDataImportExportAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table(audit.map((item) => ({
        id: item.id,
        label: item.label,
        appJsLines: item.appJsLines,
        extractionPhase: item.extractionPhase,
        extractionRisk: item.extractionRisk,
        functions: Array.isArray(item.functions) ? item.functions.length : 0
      })));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-prep', 'Nie udało się wypisać audytu importu/eksportu JSON.', error);
    }
  }
  return audit;
}

function vildaUpdatePrepDumpAppModularizationAudit() {
  const audit = vildaUpdatePrepGetAppModularizationAudit();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table(audit);
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-prep', 'Nie udało się wypisać audytu modularizacji app.js.', error);
    }
  }
  return audit;
}

function vildaUpdatePrepGetOrchestratorMap() {
  return VILDA_UPDATE_ORCHESTRATOR_MAP.map((item) => Object.assign({}, item));
}

function vildaUpdatePrepGetPublicAliasMap() {
  return VILDA_UPDATE_PUBLIC_ALIAS_MAP.map((item) => Object.assign({}, item));
}

function vildaUpdatePrepDumpOrchestratorMap() {
  const map = vildaUpdatePrepGetOrchestratorMap();
  try {
    if (typeof console !== 'undefined' && typeof console.table === 'function') {
      console.table(map);
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-prep', 'Nie udało się wypisać mapy orkiestratora update().', error);
    }
  }
  return map;
}

function vildaUpdatePrepNow() {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-prep', 'Nie udało się odczytać performance.now().', error);
    }
  }
  return Date.now();
}

function vildaUpdatePrepClonePlain(value, depth) {
  const maxDepth = typeof depth === 'number' ? depth : 4;
  if (maxDepth <= 0 || value == null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => vildaUpdatePrepClonePlain(item, maxDepth - 1));
  }
  const out = {};
  Object.keys(value).forEach((key) => {
    const current = value[key];
    if (current && typeof current === 'object' && typeof current.nodeType === 'number') {
      out[key] = { id: current.id || '', tagName: current.tagName || '', present: true };
    } else if (typeof current !== 'function') {
      out[key] = vildaUpdatePrepClonePlain(current, maxDepth - 1);
    }
  });
  return out;
}

function vildaUpdatePrepToFiniteNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (raw === '') return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function vildaUpdatePrepIsFinitePositive(value) {
  const n = vildaUpdatePrepToFiniteNumber(value);
  return n !== null && n > 0;
}

function vildaUpdatePrepIsFiniteNonNegative(value) {
  const n = vildaUpdatePrepToFiniteNumber(value);
  return n !== null && n >= 0;
}

function vildaUpdatePrepReadNumberState(el, id) {
  const raw = el && typeof el.value !== 'undefined' ? String(el.value).trim() : '';
  const value = vildaUpdatePrepToFiniteNumber(raw);
  return {
    id: id || (el && el.id ? el.id : null),
    present: !!el,
    raw,
    hasRawValue: raw !== '',
    value,
    finite: value !== null,
    positive: value !== null && value > 0,
    nonNegative: value !== null && value >= 0
  };
}

function vildaUpdatePrepReadNumber(el) {
  const state = vildaUpdatePrepReadNumberState(el);
  return state.value !== null ? state.value : 0;
}

function vildaUpdatePrepGetElement(id) {
  try {
    return document.getElementById(id);
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-prep', 'Nie udało się pobrać elementu DOM.', error, { id });
    }
    return null;
  }
}

function vildaUpdatePrepIsMainCalculatorPage() {
  return !!(vildaUpdatePrepGetElement('bmrInfo') || vildaUpdatePrepGetElement('toNormInfo'));
}

function vildaUpdatePrepReadAgeState() {
  const yearsEl = vildaUpdatePrepGetElement('age');
  const monthsEl = vildaUpdatePrepGetElement('ageMonths');
  const yearsState = vildaUpdatePrepReadNumberState(yearsEl, 'age');
  const monthsState = vildaUpdatePrepReadNumberState(monthsEl, 'ageMonths');
  let age = null;
  try {
    if (typeof getAgeDecimal === 'function') {
      const fromApp = Number(getAgeDecimal());
      age = Number.isFinite(fromApp) ? fromApp : null;
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-prep', 'Nie udało się odczytać wieku przez getAgeDecimal().', error);
    }
  }
  if (!Number.isFinite(age)) {
    const years = yearsState.finite ? yearsState.value : 0;
    const months = monthsState.finite ? Math.max(0, Math.min(11, monthsState.value)) : 0;
    age = years + (months / 12);
  }
  const hasExplicitInput = yearsState.finite || monthsState.finite;
  const finite = Number.isFinite(age);
  const validNonNegative = hasExplicitInput && finite && age >= 0 && age <= 130;
  return {
    id: 'age+ageMonths',
    value: finite ? age : null,
    finite,
    hasExplicitInput,
    validNonNegative,
    isZeroAge: validNonNegative && age === 0,
    years: yearsState,
    months: monthsState
  };
}

function vildaUpdatePrepReadAge() {
  const state = vildaUpdatePrepReadAgeState();
  return state.value !== null ? state.value : 0;
}

function vildaUpdatePrepHasPrevMeasurement() {
  try {
    const wrap = vildaUpdatePrepGetElement('prevSummaryWrap');
    const card = vildaUpdatePrepGetElement('prevSummaryCard');
    return !!((card && card.dataset && card.dataset.loaded === 'true') ||
              (wrap && wrap.dataset && wrap.dataset.loaded === 'true'));
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-prep', 'Nie udało się odczytać stanu poprzedniego pomiaru.', error);
    }
    return false;
  }
}

function vildaUpdatePrepReadMainInputs() {
  const mainCalculatorDomPresent = vildaUpdatePrepIsMainCalculatorPage();
  const weightEl = vildaUpdatePrepGetElement('weight');
  const heightEl = vildaUpdatePrepGetElement('height');
  const sexEl = vildaUpdatePrepGetElement('sex');
  const weightState = vildaUpdatePrepReadNumberState(weightEl, 'weight');
  const heightState = vildaUpdatePrepReadNumberState(heightEl, 'height');
  const ageState = mainCalculatorDomPresent
    ? vildaUpdatePrepReadAgeState()
    : { id: 'age+ageMonths', value: 0, finite: true, hasExplicitInput: false, validNonNegative: false, isZeroAge: false };
  const weight = weightState.value !== null ? weightState.value : 0;
  const height = heightState.value !== null ? heightState.value : 0;
  const age = ageState.value !== null ? ageState.value : 0;
  const sex = sexEl && sexEl.value ? sexEl.value : 'M';
  const missingRequiredElements = [];
  if (!weightEl) missingRequiredElements.push('weight');
  if (!heightEl) missingRequiredElements.push('height');
  if (!sexEl) missingRequiredElements.push('sex');
  const elements = {
    weightEl,
    heightEl,
    sexEl,
    ageEl: vildaUpdatePrepGetElement('age'),
    ageMonthsEl: vildaUpdatePrepGetElement('ageMonths'),
    errorBox: vildaUpdatePrepGetElement('errorBox'),
    results: vildaUpdatePrepGetElement('results'),
    planCard: vildaUpdatePrepGetElement('planCard'),
    planResults: vildaUpdatePrepGetElement('planResults'),
    foodRowsSection: vildaUpdatePrepGetElement('foodRowsSection'),
    foodTotalSection: vildaUpdatePrepGetElement('foodTotalSection'),
    foodTotalKcal: vildaUpdatePrepGetElement('foodTotalKcal'),
    foodTotalList: vildaUpdatePrepGetElement('foodTotalList'),
    foodTimes: vildaUpdatePrepGetElement('foodTimes'),
    foodTimesSection: vildaUpdatePrepGetElement('foodTimesSection'),
    timesCard: vildaUpdatePrepGetElement('timesCard'),
    bmrInfo: vildaUpdatePrepGetElement('bmrInfo'),
    toNormCard: vildaUpdatePrepGetElement('toNormCard'),
    toNormInfo: vildaUpdatePrepGetElement('toNormInfo'),
    sourceFieldset: vildaUpdatePrepGetElement('sourceFieldset'),
    compareInstruction: vildaUpdatePrepGetElement('compareInstruction'),
    dietCalorieInfo: vildaUpdatePrepGetElement('dietCalorieInfo'),
    planWarning: vildaUpdatePrepGetElement('planWarning'),
    childConsultCard: vildaUpdatePrepGetElement('childConsultCard')
  };
  return {
    version: VILDA_UPDATE_PREP_VERSION,
    mainCalculatorDomPresent,
    hasRequiredDom: missingRequiredElements.length === 0,
    missingRequiredElements,
    elements,
    values: { age, weight, height, sex },
    numericValidation: {
      step: '8O-10a',
      age: ageState,
      weight: weightState,
      height: heightState,
      acceptsZeroAge: ageState.isZeroAge === true,
      completeAnthro: !!(ageState.validNonNegative && weightState.positive && heightState.positive)
    },
    flags: {
      hasCompleteAnthro: !!(ageState.validNonNegative && weightState.positive && heightState.positive),
      bmiReady: weightState.positive && heightState.positive,
      bmrReady: !!(ageState.validNonNegative && weightState.positive && heightState.positive),
      hasPrevMeasurement: vildaUpdatePrepHasPrevMeasurement(),
      hasFoodSummaryDom: !!(elements.foodTotalSection && elements.foodTotalKcal && elements.foodTotalList),
      hasFoodBurnDom: !!(elements.foodTimes && elements.foodTimesSection),
      hasMainResultDom: !!(elements.results && elements.bmrInfo),
      hasPlanDom: !!(elements.planCard && elements.planResults)
    }
  };
}

function vildaUpdatePrepValidateMainInputs(inputState) {
  const values = (inputState && inputState.values) || {};
  const numeric = (inputState && inputState.numericValidation) || {};
  const ageState = numeric.age || { value: Number(values.age), hasExplicitInput: Number.isFinite(Number(values.age)), validNonNegative: Number.isFinite(Number(values.age)) && Number(values.age) >= 0 };
  const weightState = numeric.weight || { value: Number(values.weight), positive: Number(values.weight) > 0, hasRawValue: Number(values.weight) !== 0 };
  const heightState = numeric.height || { value: Number(values.height), positive: Number(values.height) > 0, hasRawValue: Number(values.height) !== 0 };
  const age = Number(values.age) || 0;
  const weight = Number(values.weight) || 0;
  const height = Number(values.height) || 0;
  const errors = [];
  if (ageState.hasExplicitInput && !(Number.isFinite(age) && age >= 0 && age <= 130)) {
    errors.push('Wiek poza zakresem (0–130 lat)');
  }
  if (weightState.hasRawValue && !(weight >= 1 && weight <= 500)) {
    errors.push('Waga poza zakresem (1–500 kg)');
  }
  if (heightState.hasRawValue && !(height >= 40 && height <= 250)) {
    errors.push('Wzrost poza zakresem (40–250 cm)');
  }
  const hasCompleteAnthro = !!(ageState.validNonNegative && weightState.positive && heightState.positive);
  const bmiReady = !!(weightState.positive && heightState.positive);
  const bmrReady = hasCompleteAnthro;
  return {
    errors,
    hasErrors: errors.length > 0,
    hasCompleteAnthro,
    bmiReady,
    bmrReady,
    acceptsZeroAge: ageState.isZeroAge === true,
    numericValidation: { age: ageState, weight: weightState, height: heightState },
    hasPrevMeasurement: !!(inputState && inputState.flags && inputState.flags.hasPrevMeasurement),
    stopReason: errors.length ? 'range-errors' : (hasCompleteAnthro ? null : 'incomplete-anthro')
  };
}

function vildaUpdatePrepGetNumericValidationSnapshot(inputState) {
  const state = inputState || vildaUpdatePrepReadMainInputs();
  const validation = vildaUpdatePrepValidateMainInputs(state);
  return {
    kind: 'update-prep-numeric-validation-age-zero',
    step: '8O-10a',
    version: VILDA_UPDATE_PREP_VERSION,
    readOnly: true,
    values: vildaUpdatePrepClonePlain(state.values, 4),
    numericValidation: vildaUpdatePrepClonePlain(state.numericValidation, 6),
    validation: vildaUpdatePrepClonePlain(validation, 6),
    acceptsZeroAge: !!(state.numericValidation && state.numericValidation.acceptsZeroAge)
  };
}

function vildaUpdatePrepCreateContext(initialInputState) {
  const inputState = initialInputState || vildaUpdatePrepReadMainInputs();
  const validation = vildaUpdatePrepValidateMainInputs(inputState);
  const nowMs = vildaUpdatePrepNow();
  return {
    version: VILDA_UPDATE_PREP_VERSION,
    runId: ++vildaUpdatePrepRunCounter,
    startedAt: new Date().toISOString(),
    startedAtMs: nowMs,
    endedAt: null,
    durationMs: null,
    status: 'started',
    stopReason: null,
    inputState,
    validation,
    sections: {},
    notes: []
  };
}

function vildaUpdatePrepMarkSection(context, sectionId, phase, meta) {
  if (!context || !sectionId) return context;
  const phaseName = phase || 'mark';
  const timeMs = vildaUpdatePrepNow();
  if (!context.sections[sectionId]) {
    context.sections[sectionId] = { id: sectionId, starts: [], ends: [], marks: [] };
  }
  const section = context.sections[sectionId];
  const entry = { phase: phaseName, timeMs, meta: meta || null };
  if (phaseName === 'start') section.starts.push(entry);
  else if (phaseName === 'end') section.ends.push(entry);
  else section.marks.push(entry);
  return context;
}

function vildaUpdatePrepAddNote(context, message, meta) {
  if (!context || !message) return context;
  context.notes.push({ message: String(message), meta: meta || null, timeMs: vildaUpdatePrepNow() });
  return context;
}

function vildaUpdatePrepFinishRun(context, status, meta) {
  if (!context) return null;
  context.status = status || context.status || 'completed';
  context.stopReason = meta && meta.stopReason ? meta.stopReason : context.stopReason;
  context.endedAt = new Date().toISOString();
  context.durationMs = Math.max(0, vildaUpdatePrepNow() - context.startedAtMs);
  if (meta) context.finishMeta = meta;
  vildaUpdatePrepLastRun = vildaUpdatePrepClonePlain(context, 6);
  return context;
}

function vildaUpdatePrepGetLastRun() {
  return vildaUpdatePrepClonePlain(vildaUpdatePrepLastRun, 6);
}

function vildaUpdatePrepGetDiagnostics() {
  const inputState = vildaUpdatePrepReadMainInputs();
  return {
    version: VILDA_UPDATE_PREP_VERSION,
    sections: vildaUpdatePrepGetSectionMap(),
    orchestratorMap: vildaUpdatePrepGetOrchestratorMap(),
    publicAliases: vildaUpdatePrepGetPublicAliasMap(),
    refactorPlan: vildaUpdatePrepGetRefactorPlan(),
    appModularizationAudit: vildaUpdatePrepGetAppModularizationAudit(),
    dataImportExportAudit: vildaUpdatePrepGetDataImportExportAudit(),
    dataImportExportExtractionPlan: vildaUpdatePrepGetDataImportExportExtractionPlan(),
    dataImportExportRiskSummary: vildaUpdatePrepGetDataImportExportRiskSummary(),
    dataImportExportFinalAudit: vildaUpdatePrepGetDataImportExportFinalAudit(),
    advancedGrowthBoundaryAudit: vildaUpdatePrepGetAdvancedGrowthBoundaryAudit(),
    advancedGrowthExtractionPlan: vildaUpdatePrepGetAdvancedGrowthExtractionPlan(),
    advancedGrowthRiskSummary: vildaUpdatePrepGetAdvancedGrowthRiskSummary(),
    nextExtractionCandidate: vildaUpdatePrepGetNextExtractionCandidate(),
    nextDataImportExportExtractionStep: vildaUpdatePrepGetNextDataImportExportExtractionStep(),
    nextAdvancedGrowthExtractionStep: vildaUpdatePrepGetNextAdvancedGrowthExtractionStep(),
    inputState,
    validation: vildaUpdatePrepValidateMainInputs(inputState),
    lastRun: vildaUpdatePrepGetLastRun()
  };
}

function vildaUpdatePrepRunOptionalHook(context, sectionId, hookName, fn) {
  if (typeof fn !== 'function') return null;
  try {
    vildaUpdatePrepMarkSection(context, sectionId || 'optional-modules', 'start', { hookName });
    const result = fn();
    vildaUpdatePrepMarkSection(context, sectionId || 'optional-modules', 'end', { hookName });
    return result;
  } catch (error) {
    vildaUpdatePrepMarkSection(context, sectionId || 'optional-modules', 'error', { hookName, message: error && error.message ? error.message : String(error) });
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-prep', 'Błąd opcjonalnego hooka update().', error, { hookName, sectionId });
    }
    return null;
  }
}


/* ========================================================================== 
 * Krok 7B: guardy strony i obsługa walidacji wejściowej update()
 *
 * Te helpery wydzielają z update() warunki zatrzymania i komunikaty wejściowe.
 * Nie zmieniają obliczeń ani kolejności dalszych sekcji; porządkują jedynie
 * decyzję: kontynuować, delegować do Klirensu albo przerwać przed obliczeniami.
 * ========================================================================== */
function vildaUpdatePrepHandleEntryGuard(context, updateFn, thisArg, argsLike) {
  vildaUpdatePrepMarkSection(context, 'entry-guards', 'start');
  const inputState = context && context.inputState ? context.inputState : vildaUpdatePrepReadMainInputs();
  if (!inputState.mainCalculatorDomPresent) {
    vildaUpdatePrepFinishRun(context, 'delegated-or-skipped', { stopReason: 'not-main-calculator-page' });
    if (typeof window !== 'undefined' && typeof window.clcrUpdate === 'function' && window.clcrUpdate !== updateFn) {
      return {
        shouldContinue: false,
        delegated: true,
        stopReason: 'not-main-calculator-page',
        result: window.clcrUpdate.apply(thisArg, argsLike || [])
      };
    }
    return { shouldContinue: false, delegated: false, stopReason: 'not-main-calculator-page', result: undefined };
  }
  vildaUpdatePrepMarkSection(context, 'entry-guards', 'end');
  return { shouldContinue: true, delegated: false, stopReason: null, result: undefined };
}

function vildaUpdatePrepHandleMissingRequiredDom(context) {
  const inputState = context && context.inputState ? context.inputState : null;
  if (!inputState || inputState.hasRequiredDom) return { shouldContinue: true, stopReason: null };
  if (typeof vildaLogAppWarn === 'function') {
    vildaLogAppWarn('app:update-guard', 'Brak wymaganych elementów DOM dla głównego update().', null, { missing: inputState.missingRequiredElements });
  }
  vildaUpdatePrepFinishRun(context, 'stopped', { stopReason: 'missing-required-dom', missing: inputState.missingRequiredElements });
  return { shouldContinue: false, stopReason: 'missing-required-dom', missing: inputState.missingRequiredElements };
}

function vildaUpdatePrepBuildInputUiState(context) {
  const elements = context && context.inputState && context.inputState.elements ? context.inputState.elements : {};
  return {
    snackFieldset: elements.foodRowsSection || null,
    mealFieldset: elements.foodRowsSection || null,
    errorBox: elements.errorBox || null,
    resultsEl: elements.results || null,
    planCardEl: elements.planCard || null,
    planResultsEl: elements.planResults || null
  };
}

function vildaUpdatePrepClearInputError(uiState) {
  const errorBox = uiState && uiState.errorBox;
  if (!errorBox) return;
  vildaAppClearHtml(errorBox);
  errorBox.style.display = 'none';
}

function vildaUpdatePrepShowInputError(uiState, html, contextName) {
  const errorBox = uiState && uiState.errorBox;
  if (!errorBox) return;
  vildaAppSetTrustedHtml(errorBox, html || '', contextName || 'app:errorBox');
  errorBox.style.display = 'block';
}

function vildaUpdatePrepKeepFoodRowsVisible(uiState) {
  if (uiState && uiState.snackFieldset) uiState.snackFieldset.style.display = 'block';
  if (uiState && uiState.mealFieldset) uiState.mealFieldset.style.display = 'block';
}

function vildaUpdatePrepHideMainResultCards(uiState) {
  if (uiState && uiState.resultsEl) uiState.resultsEl.style.display = 'none';
  if (uiState && uiState.planCardEl) uiState.planCardEl.style.display = 'none';
}

function vildaUpdatePrepRefreshDoctorPosition() {
  if (typeof repositionDoctor === 'function') {
    repositionDoctor();
  }
}

function vildaUpdatePrepHandleIncompleteAnthro(context, uiState) {
  vildaUpdatePrepHideMainResultCards(uiState);
  vildaUpdatePrepKeepFoodRowsVisible(uiState);
  const hasPrevMeasurement = !!(context && context.validation && context.validation.hasPrevMeasurement);
  if (!hasPrevMeasurement) {
    vildaUpdatePrepShowInputError(uiState, 'Podaj jednocześnie wiek, wagę i wzrost aby natychmiast zobaczyć wyniki', 'app:errorBox');
  } else {
    vildaUpdatePrepClearInputError(uiState);
  }
  vildaUpdatePrepRefreshDoctorPosition();
  vildaUpdatePrepFinishRun(context, 'stopped', { stopReason: 'incomplete-anthro' });
  return { shouldContinue: false, stopReason: 'incomplete-anthro', uiState };
}

function vildaUpdatePrepHandleRangeErrors(context, uiState) {
  const errors = (context && context.validation && context.validation.errors) || [];
  vildaUpdatePrepShowInputError(uiState, errors.join('<br>'), 'app:errorBox');
  vildaUpdatePrepHideMainResultCards(uiState);
  vildaUpdatePrepRefreshDoctorPosition();
  vildaUpdatePrepFinishRun(context, 'stopped', { stopReason: 'range-errors', errors });
  return { shouldContinue: false, stopReason: 'range-errors', errors, uiState };
}

function vildaUpdatePrepHandleInputValidation(context) {
  const uiState = vildaUpdatePrepBuildInputUiState(context);
  vildaUpdatePrepClearInputError(uiState);
  vildaUpdatePrepMarkSection(context, 'validation', 'start');
  vildaUpdatePrepKeepFoodRowsVisible(uiState);
  const validation = context && context.validation ? context.validation : { errors: [], hasCompleteAnthro: false };
  if (!validation.hasCompleteAnthro) {
    return vildaUpdatePrepHandleIncompleteAnthro(context, uiState);
  }
  if (validation.errors && validation.errors.length > 0) {
    return vildaUpdatePrepHandleRangeErrors(context, uiState);
  }
  vildaUpdatePrepMarkSection(context, 'validation', 'end', { errorsCount: 0 });
  return { shouldContinue: true, stopReason: null, uiState };
}

function vildaUpdatePrepUpdateFoodSummary(context, options = {}) {
  const inputState = context && context.inputState ? context.inputState : null;
  vildaUpdatePrepMarkSection(context, 'food-summary', 'start');
  const result = macroPracticeUpdateFoodSummary(Object.assign({}, options, {
    inputState,
    renderBurn: false
  }));
  vildaUpdatePrepMarkSection(context, 'food-summary', 'food-total-rendered', {
    kcal: result.kcal,
    itemCount: result.itemCount,
    itemsWithMacrosCount: result.itemsWithMacrosCount,
    hasFoodTotalDom: result.hasFoodTotalDom
  });
  return result;
}

function vildaUpdatePrepUpdateFoodBurnSummary(context, foodSummaryState, options = {}) {
  const inputState = context && context.inputState ? context.inputState : null;
  const elements = options.elements || macroPracticeGetFoodSummaryElements(inputState);
  const result = macroPracticeRenderFoodBurnSummary(foodSummaryState, elements, options);
  const burnRows = result && result.foodBurnState && Array.isArray(result.foodBurnState.rows)
    ? result.foodBurnState.rows.length
    : 0;
  vildaUpdatePrepMarkSection(context, 'food-summary', 'end', {
    kcal: foodSummaryState && foodSummaryState.kcal,
    itemCount: foodSummaryState && foodSummaryState.itemCount,
    burnRows
  });
  return result;
}


/* ========================================================================== 
 * Krok 7D: stan i render podstawowej sekcji BMI/BMR
 *
 * Ten blok wydziela podstawowe obliczenia BMI, klasyfikację dorosłych/dzieci,
 * ostrzeżenia BMI oraz render samej karty BMI. Metryki pediatryczne typu WFL,
 * Cole, WHR i rozbudowane z-score pozostają w update() do kolejnych kroków.
 * ========================================================================== */
function vildaUpdatePrepBsaHaycock(weight, height) {
  return 0.024265 * Math.pow(weight, 0.5378) * Math.pow(height, 0.3964);
}

function vildaUpdatePrepResolveProfessionalMode() {
  try {
    const toggleEl = document.getElementById('resultsModeToggle');
    if (toggleEl) return !!toggleEl.checked;
    if (typeof window !== 'undefined' && typeof window.professionalMode !== 'undefined') {
      return !!window.professionalMode;
    }
    if (typeof professionalMode !== 'undefined') {
      return !!professionalMode;
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-bmi-bmr', 'Nie udało się odczytać trybu profesjonalnego.', error);
    }
  }
  try {
    return typeof professionalMode !== 'undefined' ? !!professionalMode : false;
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-bmi-bmr', 'Nie udało się użyć fallbacku professionalMode.', error);
    }
    return false;
  }
}

function vildaUpdatePrepComputeBmiPercentile(params) {
  const bmi = params.bmi;
  const sex = params.sex;
  const age = params.age;
  const months = params.months;
  if (!(age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX)) return null;
  let percentile = null;
  if (typeof bmiSource !== 'undefined' && bmiSource === 'PALCZEWSKA') {
    percentile = bmiPercentileChildPal(bmi, sex, months);
  } else if (typeof bmiSource !== 'undefined' && bmiSource === 'OLAF' && months < 36) {
    percentile = bmiPercentileChildPal(bmi, sex, months);
    if (percentile == null) {
      percentile = bmiPercentileChild(bmi, sex, months);
    }
  } else {
    percentile = bmiPercentileChild(bmi, sex, months);
  }
  return percentile;
}

function vildaUpdatePrepGetPediatricBmiClassificationUnavailableLabel() {
  if (typeof window !== 'undefined' && typeof window.vildaGetPediatricBmiClassificationUnavailableLabel === 'function') {
    try { return window.vildaGetPediatricBmiClassificationUnavailableLabel(); } catch (_) {}
  }
  return VILDA_UPDATE_PREP_PEDIATRIC_BMI_UNAVAILABLE_LABEL;
}

function vildaUpdatePrepIsPediatricBmiClassificationUnavailable(category) {
  if (typeof window !== 'undefined' && typeof window.vildaIsPediatricBmiCategoryUnavailable === 'function') {
    try { return window.vildaIsPediatricBmiCategoryUnavailable(category); } catch (_) {}
  }
  return String(category || '').trim() === VILDA_UPDATE_PREP_PEDIATRIC_BMI_UNAVAILABLE_LABEL;
}

function vildaUpdatePrepResolvePediatricBmiCategoryFromPercentile(percentile, options) {
  const opts = options || {};
  if (typeof window !== 'undefined' && typeof window.vildaResolvePediatricBmiCategoryFromPercentile === 'function') {
    try { return window.vildaResolvePediatricBmiCategoryFromPercentile(percentile, opts); } catch (_) {}
  }
  const p = Number(percentile);
  if (percentile == null || !isFinite(p)) return vildaUpdatePrepGetPediatricBmiClassificationUnavailableLabel();
  const useOlaf = !!opts.useOlaf;
  const normHi = useOlaf ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
  const obesity = useOlaf ? CHILD_THRESH_OLAF.OBESE : CHILD_THRESH_WHO.OBESE;
  const z = Number(opts.zScore);
  if (isFinite(z) && z >= 3) return 'Otyłość olbrzymia';
  if (p < PERCENTILE_CUTOFF_UNDERWEIGHT) return 'Niedowaga';
  if (p < normHi) return 'Prawidłowe';
  if (p < obesity) return 'Nadwaga';
  return 'Otyłość';
}

function vildaUpdatePrepGetPediatricBmiClassificationSnapshot(options = {}) {
  const opts = options || {};
  const label = vildaUpdatePrepGetPediatricBmiClassificationUnavailableLabel();
  return {
    step: '8O-10b',
    kind: 'vilda-update-prep-pediatric-bmi-classification-snapshot',
    readOnly: true,
    executedUpdate: false,
    renderedDom: false,
    committedWindowState: false,
    adultFallbackRemoved: true,
    missingPercentileUsesAdultBmi: false,
    unavailableLabel: label,
    functions: {
      vildaUpdatePrepComputeBmiPercentile: typeof vildaUpdatePrepComputeBmiPercentile === 'function',
      vildaUpdatePrepClassifyBmi: typeof vildaUpdatePrepClassifyBmi === 'function',
      vildaUpdatePrepResolvePediatricBmiCategoryFromPercentile: typeof vildaUpdatePrepResolvePediatricBmiCategoryFromPercentile === 'function',
      vildaUpdatePrepIsPediatricBmiClassificationUnavailable: typeof vildaUpdatePrepIsPediatricBmiClassificationUnavailable === 'function',
      appAuditSnapshot: typeof window !== 'undefined' && typeof window.vildaGetPediatricBmiClassificationAuditSnapshot === 'function'
    },
    samples: {
      missingPercentile: vildaUpdatePrepResolvePediatricBmiCategoryFromPercentile(null, { useOlaf: false }),
      whoPercentile50: vildaUpdatePrepResolvePediatricBmiCategoryFromPercentile(50, { useOlaf: false }),
      olafPercentile92: vildaUpdatePrepResolvePediatricBmiCategoryFromPercentile(92, { useOlaf: true }),
      whoPercentile98: vildaUpdatePrepResolvePediatricBmiCategoryFromPercentile(98, { useOlaf: false })
    },
    includeSourceHints: opts.includeSourceHints === true ? {
      classificationGuard: 'Dla dziecka bez percentyla BMI VildaUpdatePrep zwraca label braku klasyfikacji pediatrycznej zamiast bmiCategory(bmi).',
      normalizationGuard: 'Karta drogi do normy nie pokazuje komunikatu „BMI w normie”, gdy klasyfikacja pediatryczna jest niedostępna.'
    } : null
  };
}

function vildaUpdatePrepClassifyBmi(params) {
  const bmi = params.bmi;
  const sex = params.sex;
  const age = params.age;
  const months = params.months;
  const bmiPercentile = params.bmiPercentile;
  let category;
  if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) {
    category = (typeof bmiCategoryChild === 'function')
      ? bmiCategoryChild(bmi, sex, months)
      : vildaUpdatePrepGetPediatricBmiClassificationUnavailableLabel();
    if (bmiPercentile !== null && isFinite(Number(bmiPercentile))) {
      const useOlafClass = (typeof bmiSource !== 'undefined' && (bmiSource === 'OLAF' || bmiSource === 'PALCZEWSKA') && age >= OLAF_DATA_MIN_AGE);
      let zScore = null;
      try {
        zScore = (typeof bmiZscore === 'function') ? bmiZscore(bmi, sex, months) : null;
      } catch (_) {
        zScore = null;
      }
      category = vildaUpdatePrepResolvePediatricBmiCategoryFromPercentile(bmiPercentile, { useOlaf: useOlafClass, zScore });
    } else {
      // 8O-10b: przy braku percentyla dziecięcego nie używamy klasyfikacji dorosłych jako fallbacku.
      category = vildaUpdatePrepGetPediatricBmiClassificationUnavailableLabel();
    }
  } else {
    category = bmiCategory(bmi);
  }
  return category;
}

function vildaUpdatePrepBuildBmiWarningHtml(params) {
  const bmi = params.bmi;
  const bmiPercentile = params.bmiPercentile;
  const age = params.age;
  const months = params.months;
  const sex = params.sex;
  let warningHtml = '';
  if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX && bmiPercentile !== null) {
    const useOlafWarn = (typeof bmiSource !== 'undefined' && (bmiSource === 'OLAF' || bmiSource === 'PALCZEWSKA') && age >= OLAF_DATA_MIN_AGE);
    const normalHi = useOlafWarn ? CHILD_THRESH_OLAF.NORMAL_HI : CHILD_THRESH_WHO.NORMAL_HI;
    const obesity  = useOlafWarn ? CHILD_THRESH_OLAF.OBESE     : CHILD_THRESH_WHO.OBESE;
    const zscoreWarn = bmiZscore(bmi, sex, months);
    if (zscoreWarn != null && zscoreWarn >= 3) {
      warningHtml = `<div class="centile-warning">⚠ Otyłość olbrzymia – pilna konsultacja lekarska. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
    } else if (bmiPercentile >= obesity) {
      warningHtml = `<div class="centile-warning">⚠ Otyłość – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
    } else if (bmiPercentile >= normalHi) {
      warningHtml = `<div class="centile-warning" style="color:#c75d00;">⚠ Nadwaga – zalecana konsultacja dietetyczna. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
    }
  } else if (age >= 18) {
    if (bmi >= 40) {
      warningHtml = `<div class="centile-warning"><strong>⚠ Otyłość III stopnia.</strong> Pilna konsultacja lekarska!!</div>`;
    } else if (bmi >= 35) {
      warningHtml = `<div class="centile-warning"><strong>⚠ Otyłość II stopnia.</strong> Zalecana konsultacja lekarska!</div>`;
    } else if (bmi >= 30) {
      warningHtml = `<div class="centile-warning"><strong>⚠ Otyłość I stopnia.</strong> Zalecana konsultacja lekarska.</div>`;
    } else if (bmi >= 25) {
      warningHtml = `<div class="centile-warning" style="color:#c75d00;"><strong>⚠ Nadwaga.</strong> Zalecana konsultacja dietetyczna.</div>`;
    } else if (bmi >= 24) {
      warningHtml = `<div class="centile-warning" style="color:#c75d00;">BMI mieści się jeszcze w normie, jednak zbliża się do jej górnej granicy. Warto rozważyć modyfikację nawyków żywieniowych i stylu życia.</div>`;
    }
  }
  return warningHtml;
}

function vildaUpdatePrepBuildAdultUnderweightNote(params) {
  const bmi = params.bmi;
  const age = params.age;
  const professionalModeActive = params.professionalModeActive;
  let note = '';
  if (!professionalModeActive && age >= 18 && bmi < ADULT_BMI.UNDER) {
    const sev = anorexiaSeverityAdult(bmi);
    const consult = anorexiaConsultRecommendation(bmi);
    if (sev) note += `<br><small style="color:var(--danger)">${sev}</small>`;
    if (consult) note += `<br><small style="color:var(--danger);font-weight:600">${consult}</small>`;
  }
  return note;
}

function vildaUpdatePrepResolveBmiSeverity(params) {
  const bmiCat = params.bmiCat;
  const bmiPercentile = params.bmiPercentile;
  const proActive = params.proActive;
  if (!proActive || typeof bmiCat !== 'string') return null;
  const catLower = bmiCat.toLowerCase();
  if (catLower.includes('otyłość') || catLower.includes('obesity')) return 'danger';
  if (catLower.includes('nadwaga') || catLower.includes('overweight')) return 'warning';
  if (catLower.includes('niedowaga') || catLower.includes('underweight')) {
    if (typeof bmiPercentile === 'number' && !isNaN(bmiPercentile)) {
      const roundedBmiCent = Math.round(bmiPercentile);
      if (roundedBmiCent <= 3) return 'danger';
      if (roundedBmiCent <= 5) return 'warning';
      return 'warning';
    }
    return 'warning';
  }
  return null;
}

function vildaUpdatePrepComputeBmiBmrState(context, options = {}) {
  const inputState = context && context.inputState ? context.inputState : null;
  const values = inputState && inputState.values ? inputState.values : {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const weight = Number(options.weight != null ? options.weight : values.weight) || 0;
  const height = Number(options.height != null ? options.height : values.height) || 0;
  const sex = options.sex || values.sex || 'M';
  const bmiReady = options.bmiReady != null ? !!options.bmiReady : (weight > 0 && height > 0);
  const bmrReady = options.bmrReady != null ? !!options.bmrReady : (weight > 0 && height > 0 && age > 0);
  const proActive = vildaUpdatePrepResolveProfessionalMode();
  const state = {
    version: VILDA_UPDATE_PREP_VERSION,
    age,
    weight,
    height,
    sex,
    bmiReady,
    bmrReady,
    proActive,
    bmi: null,
    bmiText: '',
    bmrKcal: null,
    bmiCat: null,
    bmiPercentile: null,
    bmiZVal: null,
    bmiSeverity: null,
    bmiWarningHtml: '',
    anorexiaNote: '',
    bsaLine: '',
    boxClass: 'result-box',
    isAdult: age >= 18,
    isChildBmiAge: age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX
  };
  if (!bmiReady) {
    vildaUpdatePrepMarkSection(context, 'bmi-bmr', 'skipped', { reason: 'bmi-not-ready' });
    return state;
  }
  vildaUpdatePrepMarkSection(context, 'bmi-bmr', 'start');
  const bmi = BMI(weight, height);
  const months = Math.round(age * 12);
  const bmiPercentile = vildaUpdatePrepComputeBmiPercentile({ bmi, sex, age, months });
  const bmiCat = vildaUpdatePrepClassifyBmi({ bmi, sex, age, months, bmiPercentile });
  const bmiWarningHtml = vildaUpdatePrepBuildBmiWarningHtml({ bmi, bmiPercentile, age, months, sex });
  const legacyProfessionalMode = (typeof professionalMode !== 'undefined') ? !!professionalMode : proActive;
  const anorexiaNote = vildaUpdatePrepBuildAdultUnderweightNote({ bmi, age, professionalModeActive: legacyProfessionalMode });
  const bmiZVal = (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) ? bmiZscore(bmi, sex, months) : null;
  const bmrKcal = bmrReady ? BMR(weight, height, age, sex) : null;
  state.bmi = bmi;
  state.bmiText = bmi.toFixed(1).replace('.', ',');
  state.bmrKcal = Number.isFinite(bmrKcal) ? bmrKcal : null;
  state.bmiCat = bmiCat;
  state.bmiPercentile = bmiPercentile;
  state.bmiZVal = bmiZVal;
  state.bmiSeverity = vildaUpdatePrepResolveBmiSeverity({ bmiCat, bmiPercentile, proActive });
  state.bmiWarningHtml = bmiWarningHtml;
  state.anorexiaNote = anorexiaNote;
  if (age > 0 && age < 18 && weight > 0 && height > 0) {
    const bsa = vildaUpdatePrepBsaHaycock(weight, height).toFixed(2).replace('.', ',');
    state.bsaLine = `<div class="bsa-info">Pow. ciała: <span class="result-val">${bsa}</span> m²</div>`;
  }
  state.boxClass = 'result-box' + bmiBoxClassForAdult(bmiCat, age);
  vildaUpdatePrepApplyBmiGlobals(state);
  vildaUpdatePrepMarkSection(context, 'bmi-bmr', 'computed', {
    bmi: state.bmi,
    bmrKcal: state.bmrKcal,
    bmiCat: state.bmiCat,
    bmiPercentile: state.bmiPercentile,
    proActive: state.proActive
  });
  return state;
}

function vildaUpdatePrepApplyBmiGlobals(state) {
  if (!state) return;
  try {
    window.bmiPercentileValue = (state.age >= CHILD_AGE_MIN && state.age <= CHILD_AGE_MAX) ? state.bmiPercentile : null;
    window.lastBmiCategory = state.bmiCat;
    window.lastBmiPercentile = (typeof state.bmiPercentile === 'number' && !isNaN(state.bmiPercentile)) ? state.bmiPercentile : null;
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-bmi-bmr', 'Nie udało się zapisać globalnego stanu BMI.', error);
    }
  }
}

function vildaUpdatePrepBuildBmiLine(state) {
  if (!state || !state.bmiReady) return '';
  let bmiLine = `<strong>BMI: `;
  const bmiValueStr = state.bmiText || (state.bmi != null ? state.bmi.toFixed(1).replace('.', ',') : '');
  if (state.proActive && state.bmiSeverity) {
    const bmiColor = state.bmiSeverity === 'danger'
      ? 'var(--danger)'
      : (state.bmiSeverity === 'warning' ? 'var(--notice-orange)' : '');
    bmiLine += `<span class="result-val pro-${state.bmiSeverity}" style="color:${bmiColor} !important; -webkit-text-fill-color:${bmiColor} !important;">${bmiValueStr}</span>`;
  } else {
    bmiLine += `<span class="result-val">${bmiValueStr}</span>`;
  }
  if (state.bmiPercentile !== null) {
    const bmiPercTxt = formatCentile(state.bmiPercentile);
    const bmiPercWord = centylWord(bmiPercTxt);
    if (state.proActive && state.bmiSeverity) {
      bmiLine += ` <span class="pro-${state.bmiSeverity}">– ${bmiPercTxt} ${bmiPercWord}</span>`;
    } else {
      bmiLine += ` – ${bmiPercTxt} ${bmiPercWord}`;
    }
  }
  if (state.bmiZVal !== null && !isNaN(state.bmiZVal) && state.proActive) {
    bmiLine += ` (Z‑score = ${state.bmiZVal.toFixed(2).replace('.', ',')})`;
  }
  const showCatAfterNumber = !(state.age >= 18 && (state.bmiCat === 'Nadwaga' || String(state.bmiCat).startsWith('Otyłość')));
  if (state.age >= 2 && showCatAfterNumber) {
    if (state.proActive && state.bmiSeverity) {
      bmiLine += ` <span class="pro-${state.bmiSeverity}">(${state.bmiCat})</span>`;
    } else {
      bmiLine += ` (${state.bmiCat})`;
    }
  }
  bmiLine += `</strong>`;
  return bmiLine;
}

function vildaUpdatePrepBuildBmiResultHtml(state) {
  if (!state || !state.bmiReady) return '';
  const bmiLine = vildaUpdatePrepBuildBmiLine(state);
  const bmiWarnSection = (state.age >= 2 && !state.proActive) ? state.bmiWarningHtml : '';
  return `<div id="bmiResult" class="${state.boxClass}">
           ${bmiLine}
           ${state.bsaLine || ''}
           ${bmiWarnSection}
           ${state.anorexiaNote || ''}
         </div>`;
}

function vildaUpdatePrepRenderBmiBmrResults(context, options = {}) {
  const state = options.bmiState || vildaUpdatePrepComputeBmiBmrState(context, options);
  const bmrInfo = options.bmrInfo || (context && context.inputState && context.inputState.elements ? context.inputState.elements.bmrInfo : null);
  const htmlPrefix = options.htmlPrefix || '';
  const bmiHtml = vildaUpdatePrepBuildBmiResultHtml(state);
  const finalHtml = `${htmlPrefix}${bmiHtml}`;
  if (bmrInfo) {
    vildaAppSetTrustedHtml(bmrInfo, finalHtml, 'app:bmrInfo');
  }
  if (typeof window.renderNutritionNormsCardFromDom === 'function') {
    try {
      window.renderNutritionNormsCardFromDom();
    } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { context: 'renderNutritionNormsCardFromDom' });
      }
    }
  }
  repositionDataSourceToggle();
  repositionCentileButtons();
  try {
    applyProModePulse(
      typeof window.lastWeightPercentile  !== 'undefined' ? window.lastWeightPercentile  : null,
      typeof window.lastHeightPercentile  !== 'undefined' ? window.lastHeightPercentile  : null,
      typeof window.lastBmiCategory       !== 'undefined' ? window.lastBmiCategory       : null,
      typeof window.lastBmiPercentile     !== 'undefined' ? window.lastBmiPercentile     : null,
      professionalMode
    );
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { context: 'applyProModePulse:bmi-bmr' });
    }
  }
  vildaUpdatePrepMarkSection(context, 'bmi-bmr', 'end', {
    rendered: !!bmrInfo,
    hasCentilePrefix: !!htmlPrefix,
    hasBmiHtml: !!bmiHtml
  });
  return { state, html: finalHtml, bmiHtml };
}



function vildaUpdatePrepResolveCentileSeverity(percentile, metric) {
  if (typeof percentile !== 'number' || !isFinite(percentile)) return null;
  if (metric === 'height') {
    if (percentile <= 3) return 'danger';
    if ((percentile > 3 && percentile < 10) || percentile > 97) return 'warning';
    return null;
  }
  if (percentile <= 3 || percentile >= 97) return 'danger';
  if ((percentile > 3 && percentile < 10) || (percentile >= 90 && percentile < 97)) return 'warning';
  return null;
}

function vildaUpdatePrepResolveProClass(severity, professionalModeActive) {
  if (!professionalModeActive || !severity) return '';
  return severity === 'danger' ? 'pro-danger' : (severity === 'warning' ? 'pro-warning' : '');
}

function vildaUpdatePrepComputeLmsBoundary(lms, zValue) {
  if (!lms || lms.length < 3 || typeof zValue !== 'number') return null;
  const L = lms[0];
  const M = lms[1];
  const S = lms[2];
  if (![L, M, S].every((value) => typeof value === 'number' && isFinite(value))) return null;
  return (L !== 0)
    ? M * Math.pow(1 + L * S * zValue, 1 / L)
    : M * Math.exp(S * zValue);
}

function vildaUpdatePrepComputeWeightHeightCentileState(context, options = {}) {
  const state = {
    age: Number(options.age),
    weight: Number(options.weight),
    height: Number(options.height),
    sex: options.sex,
    professionalModeActive: typeof options.professionalModeActive === 'boolean'
      ? options.professionalModeActive
      : (typeof professionalMode !== 'undefined' ? !!professionalMode : false),
    source: (typeof bmiSource !== 'undefined' && bmiSource) ? bmiSource : 'OLAF',
    months: null,
    applicable: false,
    usePal: false,
    statsW: null,
    statsH: null,
    w3: null,
    w97: null,
    h3: null,
    h97: null,
    weightUsedFallback: false,
    weightLine: '',
    heightLine: '',
    warningHtml: '',
    html: '',
    rendered: false
  };
  if (!(state.age <= 18 && state.weight > 0 && state.height > 0 && state.sex)) {
    vildaUpdatePrepMarkSection(context, 'weight-height-centiles', 'skipped', { reason: 'not-applicable' });
    return state;
  }
  state.applicable = true;
  state.months = Math.round(state.age * 12);
  vildaUpdatePrepMarkSection(context, 'weight-height-centiles', 'start', {
    age: state.age,
    months: state.months,
    source: state.source
  });
  state.usePal = (typeof bmiSource !== 'undefined' &&
                  (bmiSource === 'PALCZEWSKA' ||
                   (bmiSource === 'OLAF' && state.age < OLAF_DATA_MIN_AGE)));
  if (state.usePal) {
    // Zachowuje dotychczasowe działanie: przy Palczewskiej nie propagujemy
    // flagi fallbacku OLAF/WHO ustawianej przez getChildLMS().
    try { weightUsedFallback = false; } catch (error) {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('app.js', error, { context: 'weight-height-centiles:reset-weight-fallback' });
      }
    }
    state.statsW = calcPercentileStatsPal(state.weight, state.sex, state.age, 'WT');
    state.statsH = calcPercentileStatsPal(state.height, state.sex, state.age, 'HT');
    if (state.statsW && state.statsH) {
      state.w3  = getPalCentile(state.sex, state.months, 3, 'WT');
      state.w97 = getPalCentile(state.sex, state.months, 97, 'WT');
      state.h3  = getPalCentile(state.sex, state.months, 3, 'HT');
      state.h97 = getPalCentile(state.sex, state.months, 97, 'HT');
    }
  } else {
    state.statsW = calcPercentileStats(state.weight, state.sex, state.age, 'WT');
    state.statsH = calcPercentileStats(state.height, state.sex, state.age, 'HT');
    if (state.statsW && state.statsH) {
      const lmsW = getChildLMS(state.sex, state.age, 'WT');
      if (lmsW) {
        state.w3 = vildaUpdatePrepComputeLmsBoundary(lmsW, Z3);
        state.w97 = vildaUpdatePrepComputeLmsBoundary(lmsW, Z97);
      }
      const lmsH = getChildLMS(state.sex, state.age, 'HT');
      if (lmsH) {
        state.h3 = vildaUpdatePrepComputeLmsBoundary(lmsH, Z3);
        state.h97 = vildaUpdatePrepComputeLmsBoundary(lmsH, Z97);
      }
    }
  }
  try {
    state.weightUsedFallback = !!weightUsedFallback;
  } catch (error) {
    state.weightUsedFallback = false;
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { context: 'weight-height-centiles:read-weight-fallback' });
    }
  }
  if (state.statsW && state.statsH) {
    state.weightLine = vildaUpdatePrepBuildWeightCentileLine(state);
    state.heightLine = vildaUpdatePrepBuildHeightCentileLine(state);
    state.warningHtml = vildaUpdatePrepBuildWeightHeightCentileWarnings(state);
    state.html = vildaUpdatePrepBuildWeightHeightCentileHtml(state);
  }
  vildaUpdatePrepMarkSection(context, 'weight-height-centiles', state.html ? 'computed' : 'no-data', {
    source: state.source,
    usePal: state.usePal,
    weightPercentile: state.statsW ? state.statsW.percentile : null,
    heightPercentile: state.statsH ? state.statsH.percentile : null,
    fallback: state.weightUsedFallback
  });
  return state;
}

function vildaUpdatePrepBuildWeightCentileLine(state) {
  const statsW = state && state.statsW;
  if (!statsW) {
    if (state && state.source === 'WHO' && state.age * 12 > 120) {
      return 'Brak danych WHO powyżej 10 lat – użyj BMI';
    }
    return 'Brak danych';
  }
  const wCent = formatCentile(statsW.percentile);
  const weightClass = vildaUpdatePrepResolveProClass(
    vildaUpdatePrepResolveCentileSeverity(statsW.percentile, 'weight'),
    state.professionalModeActive
  );
  let weightLine = `<span class="result-val${weightClass ? ' ' + weightClass : ''}">${wCent} ${centylWord(wCent)}</span>`;
  if (state.professionalModeActive) {
    weightLine += ` (Z‑score = ${statsW.sd.toFixed(2).replace('.', ',')})`;
  }
  if (state.weightUsedFallback) {
    weightLine += ' <em>(użyto OLAF – WHO brak wagi >10 l.)</em>';
  }
  const roundedWeightCentLine = Math.round(statsW.percentile);
  if (typeof state.w3 === 'number' && roundedWeightCentLine <= 2) {
    weightLine += `, brakuje ${(state.w3 - state.weight).toFixed(1).replace('.', ',')} kg do 3 centyla`;
  }
  if (typeof state.w97 === 'number' && statsW.percentile >= 98) {
    weightLine += `, +${(state.weight - state.w97).toFixed(1).replace('.', ',')} kg ponad 97 centyl`;
  }
  return weightLine;
}

function vildaUpdatePrepBuildHeightCentileLine(state) {
  const statsH = state && state.statsH;
  if (!statsH) return 'Brak danych';
  const hCent = formatCentile(statsH.percentile);
  const heightClass = vildaUpdatePrepResolveProClass(
    vildaUpdatePrepResolveCentileSeverity(statsH.percentile, 'height'),
    state.professionalModeActive
  );
  let heightLine = `<span class="result-val${heightClass ? ' ' + heightClass : ''}">${hCent} ${centylWord(hCent)}</span>`;
  if (state.professionalModeActive) {
    heightLine += ` (Z‑score = ${statsH.sd.toFixed(2).replace('.', ',')})`;
  }
  const roundedHeightCentLine = Math.round(statsH.percentile);
  if (roundedHeightCentLine <= 2 && typeof state.h3 === 'number') {
    heightLine += `, brakuje ${(state.h3 - state.height).toFixed(1).replace('.', ',')} cm do 3 centyla`;
  }
  if (statsH.percentile >= 98 && typeof state.h97 === 'number') {
    heightLine += `, +${(state.height - state.h97).toFixed(1).replace('.', ',')} cm ponad 97 centyl`;
  }
  return heightLine;
}

function vildaUpdatePrepBuildWeightHeightCentileWarnings(state) {
  if (!state || !state.statsW || !state.statsH) return '';
  if (!(typeof state.age !== 'undefined' && state.age >= 2 && !state.professionalModeActive)) return '';
  let warnLines = '';
  const roundedHeightCent = Math.round(state.statsH.percentile);
  const roundedWeightCent = Math.round(state.statsW.percentile);
  if (roundedHeightCent < PERCENTILE_EXTREME_LOW) {
    warnLines += `<div class="centile-warning">
             ⚠ Wzrost poniżej 3 centyla – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym.
             <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
           </div>`;
  } else if (roundedHeightCent >= PERCENTILE_EXTREME_LOW && roundedHeightCent <= 10) {
    warnLines += `<div class="centile-monitor-warning">
             Regularnie monitoruj wzrastanie dziecka – wzrost w dolnym zakresie normy (3–10&nbsp;centyl).
           </div>`;
  }
  if (roundedWeightCent < PERCENTILE_EXTREME_LOW) {
    warnLines += `<div class="centile-warning">
            ⚠ Waga poniżej 3 centyla – skonsultuj dziecko z&nbsp;gastroenterologiem dziecięcym.
            <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
          </div>`;
  } else if (roundedWeightCent >= PERCENTILE_EXTREME_LOW && roundedWeightCent <= 10) {
    warnLines += `<div class="centile-monitor-warning">
               Regularnie monitoruj masę ciała dziecka – waga w dolnym zakresie normy (3–10&nbsp;centyl).
             </div>`;
  }
  if (state.statsW.percentile > PERCENTILE_EXTREME_HIGH) {
    warnLines += `<div class="centile-warning">
            ⚠ Waga powyżej 97 centyla – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym lub dietetykiem.
            <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a>
          </div>`;
  }
  return warnLines;
}

function vildaUpdatePrepBuildWeightHeightCentileHtml(state) {
  if (!state || !state.statsW || !state.statsH) return '';
  return `<div id="whResult" class="result-box result-card animate-in">
           <strong>Waga: ${state.weightLine}</strong><br>
           <strong>Wzrost: ${state.heightLine}</strong>
           ${state.warningHtml || ''}
         </div>`;
}

function vildaUpdatePrepApplyWeightHeightCentileGlobals(state) {
  if (!state || !state.statsW || !state.statsH) return;
  try {
    window.lastWeightPercentile = state.statsW ? state.statsW.percentile : null;
    window.lastHeightPercentile = state.statsH ? state.statsH.percentile : null;
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { context: 'weight-height-centiles:apply-globals' });
    }
  }
}

function vildaUpdatePrepRenderWeightHeightCentileCard(context, options = {}) {
  const state = options.state || vildaUpdatePrepComputeWeightHeightCentileState(context, options);
  vildaUpdatePrepApplyWeightHeightCentileGlobals(state);
  vildaUpdatePrepMarkSection(context, 'weight-height-centiles', state && state.html ? 'end' : 'skipped-render', {
    rendered: !!(state && state.html),
    weightPercentile: state && state.statsW ? state.statsW.percentile : null,
    heightPercentile: state && state.statsH ? state.statsH.percentile : null
  });
  return {
    state,
    html: state && state.html ? state.html : ''
  };
}


function vildaUpdatePrepGetChildMetricsElements() {
  return {
    wflCardEl: vildaUpdatePrepGetElement('wflCard'),
    wflInfoEl: vildaUpdatePrepGetElement('wflInfo'),
    wflExplanationEl: vildaUpdatePrepGetElement('wflExplanation'),
    wflNormTableEl: vildaUpdatePrepGetElement('wflNormTable'),
    wflReminderBMIEl: vildaUpdatePrepGetElement('wflReminderBMI'),
    wflReminderColeEl: vildaUpdatePrepGetElement('wflReminderCole'),
    coleCardEl: vildaUpdatePrepGetElement('coleCard'),
    coleInfoEl: vildaUpdatePrepGetElement('coleInfo'),
    coleExplanationEl: vildaUpdatePrepGetElement('coleExplanation'),
    coleNormTableEl: vildaUpdatePrepGetElement('coleNormTable'),
    whrCard: vildaUpdatePrepGetElement('whrCard'),
    whrSuggest: vildaUpdatePrepGetElement('whrSuggest'),
    whrInfo: vildaUpdatePrepGetElement('whrInfo'),
    whrInterpret: vildaUpdatePrepGetElement('whrInterpret'),
    whrChildTable: vildaUpdatePrepGetElement('whrChildTable'),
    waistEl: vildaUpdatePrepGetElement('waistCm'),
    hipEl: vildaUpdatePrepGetElement('hipCm')
  };
}

function vildaUpdatePrepResetWflElements(elements) {
  if (!elements) return;
  if (elements.wflCardEl) elements.wflCardEl.style.display = 'none';
  if (elements.wflInfoEl) vildaAppClearHtml(elements.wflInfoEl);
  if (elements.wflExplanationEl) elements.wflExplanationEl.textContent = '';
  if (elements.wflNormTableEl) {
    vildaAppClearHtml(elements.wflNormTableEl);
    elements.wflNormTableEl.style.display = 'none';
  }
  if (elements.wflReminderBMIEl) {
    elements.wflReminderBMIEl.style.display = 'none';
    elements.wflReminderBMIEl.textContent = '';
  }
  if (elements.wflReminderColeEl) {
    elements.wflReminderColeEl.style.display = 'none';
    elements.wflReminderColeEl.textContent = '';
  }
}

function vildaUpdatePrepResetColeElements(elements) {
  if (!elements) return;
  if (elements.coleCardEl && elements.coleInfoEl && elements.coleExplanationEl) {
    elements.coleCardEl.style.display = 'none';
    vildaAppClearHtml(elements.coleInfoEl);
    elements.coleInfoEl.classList.remove('bmi-warning', 'bmi-danger', 'result-card', 'animate-in', '--pulse');
    clearPulse(elements.coleInfoEl);
    elements.coleExplanationEl.textContent = '';
  }
  if (elements.coleNormTableEl) {
    vildaAppClearHtml(elements.coleNormTableEl);
    elements.coleNormTableEl.style.display = 'none';
  }
  if (typeof window !== 'undefined') {
    window.coleCatValue = null;
    window.colePercentValue = null;
  }
}

function vildaUpdatePrepComputeWflState(options = {}) {
  const age = Number(options.age) || 0;
  const weight = Number(options.weight) || 0;
  const height = Number(options.height) || 0;
  const sex = options.sex || 'M';
  const state = {
    rendered: false,
    eligible: age > 0 && age <= 2 && weight > 0 && height > 0,
    zScore: null,
    percentile: null,
    centileText: '',
    comment: '',
    warning: false,
    html: ''
  };
  if (!state.eligible) return state;
  const zWfl = computeWflZScore(weight, height, sex);
  if (zWfl === null || isNaN(zWfl)) return state;
  const wflPercentile = normalCDF(zWfl) * 100;
  const wflCentTxt = formatCentile(wflPercentile);
  let wflComment = '';
  let wflWarning = false;
  if (zWfl < -2) {
    wflComment = 'Niedowaga';
    wflWarning = true;
  } else if (zWfl >= -2 && zWfl <= 2) {
    wflComment = 'W normie';
  } else if (zWfl > 2 && zWfl <= 3) {
    wflComment = 'Nadwaga';
    wflWarning = true;
  } else if (zWfl > 3) {
    wflComment = 'Otyłość';
    wflWarning = true;
  }
  const wflValueHtml = `<strong>Z‑score: <span class="result-val">${zWfl.toFixed(2).replace('.', ',')}</span></strong>`;
  const wflPercentHtml = `<strong>Centyl: <span class="result-val">${wflCentTxt}</span></strong>`;
  const commentHtml = wflComment
    ? (wflWarning ? ` <span class="centile-warning" style="font-size:1.4rem">${wflComment}</span>` : ` <span>${wflComment}</span>`)
    : '';
  let wflSection = `${wflValueHtml}<br>${wflPercentHtml}`;
  if (commentHtml) wflSection += `<br>${commentHtml}`;
  if (wflWarning && !options.professionalModeActive) {
    let consultMsg = '';
    if (wflComment === 'Niedowaga') {
      consultMsg = `<div class="centile-warning">⚠ Niedowaga – skonsultuj dziecko z&nbsp;gastroenterologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
    } else if (wflComment === 'Nadwaga') {
      consultMsg = `<div class="centile-warning">⚠ Nadwaga – zalecana konsultacja z&nbsp;pediatrą. <a href="https://vildaclinic.pl/pediatria" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
    } else if (wflComment === 'Otyłość') {
      consultMsg = `<div class="centile-warning">⚠ Otyłość – skonsultuj dziecko z&nbsp;endokrynologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>`;
    }
    if (consultMsg) wflSection += `<br>${consultMsg}`;
  }
  state.zScore = zWfl;
  state.percentile = wflPercentile;
  state.centileText = wflCentTxt;
  state.comment = wflComment;
  state.warning = wflWarning;
  state.html = wflSection;
  return state;
}

function vildaUpdatePrepRenderWflMetrics(context, options = {}, elements) {
  const els = elements || vildaUpdatePrepGetChildMetricsElements();
  const state = vildaUpdatePrepComputeWflState(options);
  if (els.wflCardEl && els.wflInfoEl && els.wflExplanationEl && els.wflNormTableEl && state.html) {
    vildaAppSetTrustedHtml(els.wflInfoEl, state.html, 'app:wflInfoEl');
    vildaAppSetTrustedHtml(els.wflExplanationEl, 'Wskaźnik WFL porównuje masę ciała dziecka z medianą masy dla jego długości lub wzrostu (standardy WHO). ' +
      'Dla dzieci do 2 lat wartości Z‑score powyżej +2 odchylenia standardowego świadczą o nadwadze, a powyżej +3 – otyłości. ' +
      'Centyl odzwierciedla, jaki odsetek rówieśników ma mniejszą lub równą masę dla danej długości.', 'app:wflExplanationEl');
    vildaAppSetTrustedHtml(els.wflNormTableEl, '<table style="width:100%;border-collapse:collapse;margin-top:0.6rem;"><tr><th>Zakres Z</th><th>Interpretacja</th></tr>' +
      '<tr><td>&lt; −2</td><td>Niedowaga</td></tr>' +
      '<tr><td>−2 – 2</td><td>W normie</td></tr>' +
      '<tr><td>2 – 3</td><td>Nadwaga</td></tr>' +
      '<tr><td>&ge; 3</td><td>Otyłość</td></tr></table>', 'app:wflNormTableEl');
    els.wflNormTableEl.style.display = 'block';
    els.wflCardEl.style.display = 'block';
    state.rendered = true;
  }
  if (options.age > 0 && options.age <= 2) {
    const note = 'Amerykańska Akademia Pediatrii zaleca stosowanie wskaźnika waga do długość/wzrostu (WFL) do oceny stanu odżywienia u dzieci młodszych niż 2 lata, natomiast wskaźnika BMI u dzieci starszych.';
    if (els.wflReminderBMIEl) {
      els.wflReminderBMIEl.textContent = note;
      els.wflReminderBMIEl.style.display = 'block';
    }
    if (els.wflReminderColeEl) {
      els.wflReminderColeEl.textContent = note;
      els.wflReminderColeEl.style.display = 'block';
    }
  }
  vildaUpdatePrepMarkSection(context, 'child-metrics', 'wfl', {
    rendered: state.rendered,
    zScore: state.zScore,
    percentile: state.percentile,
    comment: state.comment
  });
  return state;
}

function vildaUpdatePrepResolveColeBmiCategory(age, sex, bmiNow, months) {
  if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) {
    return bmiCategoryChild(bmiNow, sex, months);
  }
  return bmiCategory(bmiNow);
}

function vildaUpdatePrepBuildColeExplanation(params) {
  const isBMINormal = params.isBMINormal;
  const isColeOver = params.isColeOver;
  const isBMIOver = params.isBMIOver;
  const isColeNormal = params.isColeNormal;
  const isColeUnder = params.isColeUnder;
  const isBMIUnder = params.isBMIUnder;
  let expl =
    'Wskaźnik Cole’a porównuje <em>aktualne BMI</em> dziecka z <em>medianą BMI</em> dla jego wieku i płci (wg wybranego źródła: OLAF/WHO). ' +
    'Wartość ~100% oznacza BMI zbliżone do mediany; &lt;90% – niedowagę; 90–110% – normę; &gt;110–&lt;120% – nadwagę; ≥120% – otyłość.';
  if (isColeOver && isBMINormal) {
    expl =
      '<p>🔎 <strong>Dlaczego wskaźnik Cole’a wskazuje na nadwagę lub otyłość, mimo że BMI jest jeszcze w normie?</strong></p>' +
      '<p>Oba wskaźniki są policzone poprawnie. BMI ocenia proporcję masy do wzrostu względem rówieśników (OLAF/WHO), ' +
      'natomiast wskaźnik Cole’a porównuje BMI do międzynarodowych standardów ryzyka nadwagi/otyłości w dorosłości. ' +
      'U wysokich dzieci masa względem wieku bywa wyższa niż przeciętnie, choć BMI pozostaje prawidłowe.</p>' +
      '<p>👉 To sygnał, by przyjrzeć się stylowi życia dziecka (aktywność, żywienie). W razie wątpliwości skonsultuj się z dietetykiem/lekarzem.</p>';
  } else if (isBMIOver && isColeNormal) {
    expl =
      '<p>🔎 <strong>Dlaczego BMI wskazuje na nadwagę lub otyłość, mimo że wskaźnik Cole’a pozostaje w normie?</strong></p>' +
      '<p>Oba wskaźniki są policzone poprawnie, lecz akcentują różne aspekty. BMI jest wrażliwe na niski wzrost ' +
      '(przy niskim wzroście ta sama masa daje wyższe BMI), podczas gdy wskaźnik Cole’a porównuje BMI do mediany BMI i może pozostać w normie.</p>' +
      '<p>👉 Zalecana weryfikacja na siatkach centylowych i konsultacja dietetyczna/lekarza, jeśli BMI przekracza próg nadwagi/otyłości.</p>';
  } else if (isColeUnder && isBMINormal) {
    expl =
      '<p>🔎 <strong>Dlaczego wskaźnik Cole’a sugeruje niedowagę, a BMI jest w normie?</strong></p>' +
      '<p>To różnica perspektyw: Cole porównuje BMI do mediany BMI; u wyjątkowo szczupłych, ale wysokich dzieci ' +
      'masa względem wieku może wypadać nisko, przy prawidłowym BMI.</p>';
  } else if (isBMIUnder && !isColeUnder) {
    expl =
      '<p>🔎 <strong>Dlaczego BMI wskazuje niedowagę, a wskaźnik Cole’a nie?</strong></p>' +
      '<p>Wynika to z różnic metod. BMI silniej akcentuje relację masa/wzrost; Cole porównuje BMI do mediany BMI. ' +
      'Przy ocenie zawsze kieruj się siatkami BMI-for-age oraz konsultacją kliniczną.</p>';
  }
  return expl;
}

function vildaUpdatePrepComputeColeState(options = {}) {
  const age = Number(options.age) || 0;
  const weight = Number(options.weight) || 0;
  const height = Number(options.height) || 0;
  const sex = options.sex || 'M';
  const isAdultPatient = (typeof patientReportIsAdultAge === 'function')
    ? patientReportIsAdultAge(age)
    : (isFinite(age) && age >= 18);
  const state = {
    rendered: false,
    eligible: age > 0 && !isAdultPatient && weight > 0 && height > 0,
    cole: null,
    coleCat: null,
    bmiCat: null,
    explanationHtml: ''
  };
  if (!state.eligible) return state;
  const months = Math.round(age * 12);
  const lmsBMI = getLMS(sex, months);
  if (!(lmsBMI && lmsBMI[1] > 0)) return state;
  const medianBMI = lmsBMI[1];
  const bmiNow = BMI(weight, height);
  const cole = (bmiNow / medianBMI) * 100;
  let coleCat = 'W normie';
  if (cole < 90) coleCat = 'Niedowaga';
  else if (cole > 110 && cole < 120) coleCat = 'Nadwaga';
  else if (cole >= 120) coleCat = 'Otyłość';
  const bmiCat = vildaUpdatePrepResolveColeBmiCategory(age, sex, bmiNow, months);
  const isBMINormal = (bmiCat === 'Prawidłowe' || bmiCat === 'W normie');
  const isColeNormal = (coleCat === 'W normie');
  const isBMIOver = (bmiCat === 'Nadwaga' || String(bmiCat).startsWith('Otyłość'));
  const isColeOver = (coleCat === 'Nadwaga' || String(coleCat).startsWith('Otyłość'));
  const isBMIUnder = (bmiCat === 'Niedowaga');
  const isColeUnder = (coleCat === 'Niedowaga');
  state.cole = cole;
  state.coleCat = coleCat;
  state.bmiCat = bmiCat;
  state.explanationHtml = vildaUpdatePrepBuildColeExplanation({
    isBMINormal,
    isColeNormal,
    isBMIOver,
    isColeOver,
    isBMIUnder,
    isColeUnder
  });
  return state;
}

function vildaUpdatePrepRenderColeMetrics(context, options = {}, elements) {
  const els = elements || vildaUpdatePrepGetChildMetricsElements();
  const state = vildaUpdatePrepComputeColeState(options);
  if (!(els.coleCardEl && els.coleInfoEl && els.coleExplanationEl && state.cole != null)) {
    vildaUpdatePrepMarkSection(context, 'child-metrics', 'cole-skipped', { eligible: state.eligible });
    return state;
  }
  if (typeof window !== 'undefined') {
    window.coleCatValue = state.coleCat;
    window.colePercentValue = state.cole;
  }
  vildaAppSetTrustedHtml(els.coleInfoEl, `<strong>Wskaźnik Cole'a: <span class="result-val">${state.cole.toFixed(1).replace('.', ',')}%</span></strong>`, 'app:coleInfoEl');
  els.coleInfoEl.classList.add('animate-in', '--pulse');
  els.coleInfoEl.classList.remove('bmi-warning', 'bmi-danger');
  clearPulse(els.coleInfoEl);
  if (state.coleCat === 'Otyłość') {
    els.coleInfoEl.classList.add('bmi-danger');
    applyPulse(els.coleInfoEl, 'danger');
  } else if (state.coleCat === 'Nadwaga' || state.coleCat === 'Niedowaga') {
    els.coleInfoEl.classList.add('bmi-warning');
    applyPulse(els.coleInfoEl, 'warning');
  } else {
    clearPulse(els.coleInfoEl);
  }
  if (els.coleNormTableEl) {
    vildaAppSetTrustedHtml(els.coleNormTableEl, '<table style="margin-top:8px;">' +
      '<tr><th>Wskaźnik Cole’a (%)</th><th>Interpretacja</th></tr>' +
      '<tr><td>&lt; 90</td><td>Niedowaga</td></tr>' +
      '<tr><td>90–110</td><td>W normie</td></tr>' +
      '<tr><td>&gt; 110–&lt; 120</td><td>Nadwaga</td></tr>' +
      '<tr><td>&ge; 120</td><td>Otyłość</td></tr>' +
      '</table>', 'app:coleNormTableEl');
    els.coleNormTableEl.style.display = 'block';
  }
  vildaAppSetTrustedHtml(els.coleExplanationEl, state.explanationHtml, 'app:coleExplanationEl');
  els.coleCardEl.style.display = 'block';
  state.rendered = true;
  vildaUpdatePrepMarkSection(context, 'child-metrics', 'cole', {
    rendered: true,
    cole: state.cole,
    coleCat: state.coleCat,
    bmiCat: state.bmiCat
  });
  return state;
}

function vildaUpdatePrepRenderWhrMetrics(context, options = {}, elements) {
  const els = elements || vildaUpdatePrepGetChildMetricsElements();
  const state = { rendered: false, suggested: false, whr: null, resultState: null };
  if (!(els.whrCard && els.whrSuggest && els.whrInfo && els.whrInterpret && els.whrChildTable)) {
    vildaUpdatePrepMarkSection(context, 'child-metrics', 'whr-skipped', { reason: 'missing-dom' });
    return state;
  }
  if (typeof shouldSuggestWHR !== 'function' || typeof interpretWHR !== 'function') {
    vildaUpdatePrepMarkSection(context, 'child-metrics', 'whr-skipped', { reason: 'missing-functions' });
    return state;
  }
  const age = Number(options.age) || 0;
  const weight = Number(options.weight) || 0;
  const height = Number(options.height) || 0;
  const sex = options.sex || 'M';
  els.whrCard.style.display = 'block';
  const bmiNow = (weight > 0 && height > 0) ? BMI(weight, height) : null;
  const bmiPChild = (typeof window.bmiPercentileValue === 'number') ? window.bmiPercentileValue : null;
  const coleCatNow = (typeof window.coleCatValue === 'string') ? window.coleCatValue : null;
  const suggest = shouldSuggestWHR(age, sex, bmiNow, bmiPChild, coleCatNow);
  state.suggested = !!suggest;
  els.whrSuggest.style.display = suggest ? 'block' : 'none';
  clearPulse(els.whrSuggest);
  if (suggest) applyPulse(els.whrSuggest, 'warning');
  const waistCm = parseFloat(els.waistEl && els.waistEl.value) || 0;
  const hipCm = parseFloat(els.hipEl && els.hipEl.value) || 0;
  if (waistCm > 0 && hipCm > 0) {
    els.whrSuggest.style.display = 'none';
    clearPulse(els.whrSuggest);
  }
  if (!(waistCm > 0 && hipCm > 0)) {
    els.whrInfo.style.display = 'none';
    els.whrInterpret.style.display = 'none';
    els.whrChildTable.style.display = 'none';
    vildaAppClearHtml(els.whrChildTable);
    vildaUpdatePrepMarkSection(context, 'child-metrics', 'whr-input-missing', { suggested: state.suggested });
    return state;
  }
  const result = interpretWHR(age, sex, waistCm, hipCm, bmiNow, bmiPChild, coleCatNow);
  if (!result) {
    els.whrInfo.style.display = 'none';
    els.whrInterpret.style.display = 'none';
    els.whrChildTable.style.display = 'none';
    vildaAppClearHtml(els.whrChildTable);
    vildaUpdatePrepMarkSection(context, 'child-metrics', 'whr-no-result', { suggested: state.suggested });
    return state;
  }
  let statusHtml;
  if (result.state === 'ok') {
    statusHtml = `<div class="whr-status ok">${result.interp}${result.note ? `<br><em>${result.note}</em>` : ''}</div>`;
  } else if (result.state === 'warn') {
    statusHtml = `<div class="whr-status warn">${result.interp}</div>`;
  } else {
    statusHtml = `<div class="whr-status bad">${result.interp}</div>`;
  }
  vildaAppSetTrustedHtml(els.whrInfo, `
<div class="whr-result">
  <div class="whr-topline">
    <span class="whr-label">WHR:</span>
    <span class="whr-number">${result.whr}</span>
  </div>
  ${statusHtml}
</div>`, 'app:whrInfo');
  els.whrInfo.style.display = 'block';
  els.whrInfo.classList.remove('whr-warning', 'whr-danger');
  if (result.state === 'warn') {
    els.whrInfo.classList.add('whr-warning');
  } else if (result.state !== 'ok') {
    els.whrInfo.classList.add('whr-danger');
  }
  clearPulse(els.whrInfo);
  if (result.state === 'warn') {
    applyPulse(els.whrInfo, 'warning');
  } else if (result.state === 'bad') {
    applyPulse(els.whrInfo, 'danger');
  }
  els.whrInterpret.style.display = 'none';
  vildaAppClearHtml(els.whrInterpret);
  if (result.showTable) {
    vildaAppSetTrustedHtml(els.whrChildTable, result.tableHtml, 'app:whrChildTable');
    els.whrChildTable.style.display = 'block';
  } else {
    els.whrChildTable.style.display = 'none';
    vildaAppClearHtml(els.whrChildTable);
  }
  state.rendered = true;
  state.whr = result.whr;
  state.resultState = result.state;
  vildaUpdatePrepMarkSection(context, 'child-metrics', 'whr', {
    rendered: true,
    whr: result.whr,
    state: result.state,
    suggested: state.suggested
  });
  return state;
}

function vildaUpdatePrepUpdateChildMetrics(context, options = {}) {
  const inputState = context && context.inputState ? context.inputState : null;
  const values = inputState && inputState.values ? inputState.values : {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const weight = Number(options.weight != null ? options.weight : values.weight) || 0;
  const height = Number(options.height != null ? options.height : values.height) || 0;
  const sex = options.sex || values.sex || 'M';
  const professionalModeActive = options.professionalModeActive != null
    ? !!options.professionalModeActive
    : ((typeof professionalMode !== 'undefined') ? !!professionalMode : vildaUpdatePrepResolveProfessionalMode());
  vildaUpdatePrepMarkSection(context, 'child-metrics', 'start', { age, weight, height, sex });
  const elements = vildaUpdatePrepGetChildMetricsElements();
  vildaUpdatePrepResetWflElements(elements);
  vildaUpdatePrepResetColeElements(elements);
  const childOptions = { age, weight, height, sex, professionalModeActive, bmiState: options.bmiState || null };
  const wfl = vildaUpdatePrepRenderWflMetrics(context, childOptions, elements);
  const cole = vildaUpdatePrepRenderColeMetrics(context, childOptions, elements);
  const whr = vildaUpdatePrepRenderWhrMetrics(context, childOptions, elements);
  const state = { version: VILDA_UPDATE_PREP_VERSION, wfl, cole, whr };
  vildaUpdatePrepMarkSection(context, 'child-metrics', 'end', {
    wflRendered: !!(wfl && wfl.rendered),
    coleRendered: !!(cole && cole.rendered),
    whrRendered: !!(whr && whr.rendered)
  });
  return state;
}

function vildaUpdatePrepFormatOneDecimal(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num.toFixed(1).replace('.', ',');
}

function vildaUpdatePrepGetBmiNormalizationElements(options = {}) {
  const supplied = options.elements || {};
  return {
    toNormCard: supplied.toNormCard || vildaUpdatePrepGetElement('toNormCard'),
    toNormInfo: supplied.toNormInfo || vildaUpdatePrepGetElement('toNormInfo'),
    planCard: supplied.planCard || vildaUpdatePrepGetElement('planCard'),
    planResults: supplied.planResults || vildaUpdatePrepGetElement('planResults'),
    dietCalorieInfo: supplied.dietCalorieInfo || supplied.dietCalInfo || vildaUpdatePrepGetElement('dietCalorieInfo'),
    planWarning: supplied.planWarning || supplied.planWarningEl || vildaUpdatePrepGetElement('planWarning'),
    childConsultCard: supplied.childConsultCard || vildaUpdatePrepGetElement('childConsultCard')
  };
}

function vildaUpdatePrepHideElement(element) {
  if (element) element.style.display = 'none';
}

function vildaUpdatePrepShowElement(element, displayValue) {
  if (element) element.style.display = displayValue || 'block';
}

function vildaUpdatePrepSafeClearPulse(element, moduleName) {
  if (!element) return;
  try {
    if (typeof clearPulse === 'function') clearPulse(element);
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn(moduleName || 'app:update-bmi-normalization', 'Nie udało się wyczyścić efektu pulsowania.', error);
    }
  }
}

function vildaUpdatePrepSafeApplyPulse(element, severity, moduleName) {
  if (!element) return;
  try {
    if (typeof applyPulse === 'function') applyPulse(element, severity);
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn(moduleName || 'app:update-bmi-normalization', 'Nie udało się zastosować efektu pulsowania.', error, { severity });
    }
  }
}

function vildaUpdatePrepResetBmiNormalizationUi(context, options = {}) {
  const elements = vildaUpdatePrepGetBmiNormalizationElements(options);
  const resetPlan = options.resetPlan !== false;
  const resetToNorm = options.resetToNorm !== false;
  vildaUpdatePrepMarkSection(context, 'bmi-normalization', 'mark', {
    action: 'reset-ui',
    resetPlan,
    resetToNorm
  });
  if (resetPlan) {
    vildaUpdatePrepHideElement(elements.planCard);
    if (elements.planResults) vildaAppClearHtml(elements.planResults);
    vildaUpdatePrepHideElement(elements.dietCalorieInfo);
    vildaUpdatePrepHideElement(elements.planWarning);
    vildaUpdatePrepSafeClearPulse(elements.planWarning, 'app:update-bmi-normalization');
    vildaUpdatePrepHideElement(elements.childConsultCard);
  }
  if (resetToNorm) {
    if (elements.toNormInfo) vildaAppClearHtml(elements.toNormInfo);
    vildaUpdatePrepHideElement(elements.toNormCard);
  }
  return elements;
}

function vildaUpdatePrepResolveBmiNormalizationCategory(age, bmi, sex) {
  if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX) {
    const months = Math.round(age * 12);
    return (typeof bmiCategoryChild === 'function')
      ? bmiCategoryChild(bmi, sex, months)
      : vildaUpdatePrepGetPediatricBmiClassificationUnavailableLabel();
  }
  return bmiCategory(bmi);
}

function vildaUpdatePrepComputeMedianBmiWeight(age, height, sex) {
  const state = { medianBMI: null, medianWeight: null };
  try {
    const monthsForMedian = Math.round(age * 12);
    if (typeof getLMS === 'function') {
      const lmsArr = getLMS(sex, monthsForMedian);
      if (Array.isArray(lmsArr) && lmsArr.length >= 2) {
        state.medianBMI = lmsArr[1];
      }
    }
  } catch (error) {
    if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
      globalThis.vildaLogSwallowedCatch('app.js', error, { section: 'bmi-normalization:median-bmi' });
    } else if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-bmi-normalization', 'Nie udało się obliczyć medianowego BMI.', error);
    }
  }
  if (state.medianBMI && height) {
    state.medianWeight = state.medianBMI * Math.pow(height / CM_TO_M, 2);
  }
  return state;
}

function vildaUpdatePrepBuildReductionToNormHtml(options, toNorm) {
  const age = Number(options.age) || 0;
  const height = Number(options.height) || 0;
  const sex = options.sex || 'M';
  const professionalModeActive = !!options.professionalModeActive;
  if (age < 5) {
    const median = vildaUpdatePrepComputeMedianBmiWeight(age, height, sex);
    const normMessage = median.medianWeight
      ? `Przy wzroście ${vildaUpdatePrepFormatOneDecimal(height)} cm dzieci w tym wieku średnio ważą ok. ${vildaUpdatePrepFormatOneDecimal(median.medianWeight)} kg (50 centyl BMI).`
      : '';
    return `<div class="result-box">
  <strong>Musisz zredukować masę o ${vildaUpdatePrepFormatOneDecimal(toNorm.kgToLose)} kg<br>
  (ok. ${Math.round(toNorm.kcalToBurn)} kcal)</strong><br>
  ${professionalModeActive ? '' : '<span style="color:var(--danger);font-weight:600;">Dziecko poniżej 5 lat z nadwagą lub otyłością wymaga konsultacji z&nbsp;lekarzem lub dietetykiem.</span><br>'}
  ${normMessage}
</div>`;
  }
  return `<div class="result-box">
  <strong>Musisz zredukować masę o ${vildaUpdatePrepFormatOneDecimal(toNorm.kgToLose)} kg<br>
  (ok. ${Math.round(toNorm.kcalToBurn)} kcal)</strong>
  ${toNorm.table}
</div>`;
}

function vildaUpdatePrepBuildUnderweightToNormHtml(options, kgGain) {
  const age = Number(options.age) || 0;
  const professionalModeActive = !!options.professionalModeActive;
  const gainMsg = kgGain > 0
    ? `<br>Brakuje ok. <strong>${vildaUpdatePrepFormatOneDecimal(kgGain)} kg</strong> do dolnej granicy normy BMI.`
    : '';
  if (professionalModeActive) {
    return `<div class="result-box" style="color:var(--primary)">
      BMI wskazuje na niedowagę.${gainMsg}
    </div>`;
  }
  if (age < 10) {
    return `<div class="result-box">
      <div class="centile-warning">⚠ Dziecko poniżej 10 lat z niedowagą wymaga konsultacji z&nbsp;pediatrą lub gastroenterologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer">Umów wizytę</a></div>
      ${gainMsg}
    </div>`;
  }
  return `
    <div class="result-box" style="color:var(--primary)">
      Twoje BMI wskazuje na niedowagę – rozważ zwiększenie kaloryczności diety
      i&nbsp;konsultację z&nbsp;dietetykiem.${gainMsg}
    </div>`;
}

function vildaUpdatePrepRenderReductionPlanUi(context, options = {}, elements, category) {
  const age = Number(options.age) || 0;
  const professionalModeActive = !!options.professionalModeActive;
  const cat = category == null ? '' : String(category);
  const overweightOrObesity = category === 'Nadwaga' || cat.startsWith('Otyłość');
  const state = { category, overweightOrObesity, planAction: 'hidden', consultationAction: 'hidden', warningAction: 'hidden' };
  if (!overweightOrObesity) {
    vildaUpdatePrepHideElement(elements.planCard);
    vildaUpdatePrepHideElement(elements.planWarning);
    vildaUpdatePrepSafeClearPulse(elements.planWarning, 'app:update-bmi-normalization');
    vildaUpdatePrepHideElement(elements.childConsultCard);
    return state;
  }

  if (professionalModeActive) {
    vildaUpdatePrepShowElement(elements.planCard);
    if (elements.planCard && elements.planResults && typeof updatePlanFromDiet === 'function') updatePlanFromDiet();
    vildaUpdatePrepHideElement(elements.planWarning);
    vildaUpdatePrepSafeClearPulse(elements.planWarning, 'app:update-bmi-normalization');
    vildaUpdatePrepHideElement(elements.childConsultCard);
    state.planAction = 'shown-professional';
    return state;
  }

  if (age < 5) {
    vildaUpdatePrepHideElement(elements.planCard);
    vildaUpdatePrepHideElement(elements.planWarning);
    vildaUpdatePrepSafeClearPulse(elements.planWarning, 'app:update-bmi-normalization');
    if (elements.childConsultCard) {
      vildaAppSetTrustedHtml(elements.childConsultCard, `<div style="color:var(--danger);font-weight:600;">⚠ Dziecko poniżej 5 lat z nadwagą lub otyłością wymaga konsultacji z&nbsp;endokrynologiem dziecięcym. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">Umów wizytę</a></div>`, 'app:childConsultCard');
      vildaUpdatePrepShowElement(elements.childConsultCard);
      state.consultationAction = 'shown-child-under-5';
    }
    return state;
  }

  vildaUpdatePrepShowElement(elements.planCard);
  if (elements.planCard && elements.planResults && typeof updatePlanFromDiet === 'function') updatePlanFromDiet();
  vildaUpdatePrepHideElement(elements.childConsultCard);
  state.planAction = 'shown';
  if (age < 10) {
    if (elements.planWarning) {
      vildaAppSetTrustedHtml(elements.planWarning, `⚠ Dziecko poniżej&nbsp;10 lat z nadwagą lub otyłością powinno skonsultować się z&nbsp;dietetykiem lub endokrynologiem dziecięcym. Proponowany plan ma charakter poglądowy. <a href="https://vildaclinic.pl" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">Umów wizytę</a>`, 'app:planWarningEl');
      vildaUpdatePrepShowElement(elements.planWarning);
      vildaUpdatePrepSafeApplyPulse(elements.planWarning, 'danger', 'app:update-bmi-normalization');
      state.warningAction = 'shown-child-under-10';
    }
  } else {
    vildaUpdatePrepHideElement(elements.planWarning);
    vildaUpdatePrepSafeClearPulse(elements.planWarning, 'app:update-bmi-normalization');
  }
  return state;
}

function vildaUpdatePrepUpdateBmiNormalizationAndPlan(context, options = {}) {
  const values = (context && context.inputState && context.inputState.values) || {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const weight = Number(options.weight != null ? options.weight : values.weight) || 0;
  const height = Number(options.height != null ? options.height : values.height) || 0;
  const sex = options.sex || values.sex || 'M';
  const bmiReady = options.bmiReady != null ? !!options.bmiReady : (weight > 0 && height > 0);
  const professionalModeActive = options.professionalModeActive != null
    ? !!options.professionalModeActive
    : ((typeof professionalMode !== 'undefined') ? !!professionalMode : vildaUpdatePrepResolveProfessionalMode());
  const elements = vildaUpdatePrepGetBmiNormalizationElements(options);
  const state = {
    version: VILDA_UPDATE_PREP_VERSION,
    bmiReady,
    bmi: null,
    category: null,
    toNormAvailable: false,
    toNormRendered: false,
    mode: null,
    plan: null,
    stopReason: null
  };
  vildaUpdatePrepMarkSection(context, 'bmi-normalization', 'start', { age, weight, height, sex, bmiReady });
  if (!bmiReady) {
    state.stopReason = 'bmi-not-ready';
    vildaUpdatePrepMarkSection(context, 'bmi-normalization', 'end', state);
    return state;
  }

  const bmiCurrent = options.bmiState && Number.isFinite(Number(options.bmiState.bmi))
    ? Number(options.bmiState.bmi)
    : BMI(weight, height);
  state.bmi = bmiCurrent;

  // Zachowanie historyczne: u dorosłych z BMI < 18,5 karta „droga do normy” pozostaje ukryta.
  if (age >= 18 && bmiCurrent < 18.5) {
    vildaUpdatePrepHideElement(elements.toNormCard);
    state.stopReason = 'adult-underweight-hidden';
    vildaUpdatePrepMarkSection(context, 'bmi-normalization', 'end', state);
    return state;
  }

  const toNorm = typeof distanceToNormalBMI === 'function'
    ? distanceToNormalBMI(weight, height, age, sex)
    : null;
  state.toNormAvailable = !!toNorm;

  if (toNorm) {
    const html = vildaUpdatePrepBuildReductionToNormHtml({ age, height, sex, professionalModeActive }, toNorm);
    if (elements.toNormInfo) vildaAppSetTrustedHtml(elements.toNormInfo, html, 'app:toNormInfo');
    vildaUpdatePrepShowElement(elements.toNormCard);
    state.toNormRendered = true;
    state.mode = 'reduction';
    state.category = vildaUpdatePrepResolveBmiNormalizationCategory(age, bmiCurrent, sex);
    state.plan = vildaUpdatePrepRenderReductionPlanUi(context, { age, professionalModeActive }, elements, state.category);
    vildaUpdatePrepMarkSection(context, 'bmi-normalization', 'end', {
      mode: state.mode,
      category: state.category,
      plan: state.plan,
      toNormRendered: state.toNormRendered
    });
    return state;
  }

  state.category = vildaUpdatePrepResolveBmiNormalizationCategory(age, bmiCurrent, sex);
  if (state.category === 'Niedowaga') {
    let kgGain = 0;
    if (age >= CHILD_AGE_MIN && age <= CHILD_AGE_MAX && typeof kgToReachNormalBMIChild === 'function') {
      kgGain = kgToReachNormalBMIChild(weight, height, age, sex);
    }
    if (elements.toNormInfo) {
      vildaAppSetTrustedHtml(elements.toNormInfo, vildaUpdatePrepBuildUnderweightToNormHtml({ age, professionalModeActive }, kgGain), 'app:toNormInfo');
    }
    state.mode = 'underweight';
  } else if (vildaUpdatePrepIsPediatricBmiClassificationUnavailable(state.category)) {
    if (elements.toNormInfo) {
      vildaAppSetTrustedHtml(elements.toNormInfo, `<div class="result-box" style="color:var(--muted)">
        Brak klasyfikacji pediatrycznej BMI — brak danych referencyjnych dla wieku i płci. Nie zastosowano progów BMI dorosłych.
      </div>`, 'app:toNormInfo');
    }
    state.mode = 'pediatric-bmi-reference-unavailable';
  } else if (age >= 18 && bmiCurrent >= 24 && bmiCurrent < 25) {
    if (elements.toNormInfo) {
      vildaAppSetTrustedHtml(elements.toNormInfo, `<div class="result-box" style="color:#c75d00;">
        Wskaźnik BMI mieści się jeszcze w normie, jednak zbliża się do jej górnej granicy.
        Zalecana jest modyfikacja nawyków żywieniowych i stylu życia.
      </div>`, 'app:toNormInfo');
    }
    state.mode = 'adult-near-upper-normal';
  } else {
    if (elements.toNormInfo) {
      vildaAppSetTrustedHtml(elements.toNormInfo, `<div class="result-box" style="color:var(--primary)">
        Twoje BMI jest już w normie! 🚀
      </div>`, 'app:toNormInfo');
    }
    state.mode = 'normal';
  }
  vildaUpdatePrepShowElement(elements.toNormCard);
  state.toNormRendered = true;
  vildaUpdatePrepMarkSection(context, 'bmi-normalization', 'end', {
    mode: state.mode,
    category: state.category,
    toNormRendered: state.toNormRendered
  });

  return state;
}

/* ==========================================================================
 * Krok 7F: interpretacje dorosłych, widoczność modułów zależnych od wieku
 * oraz odświeżenie UI ryzyka metabolicznego.
 *
 * Helpery poniżej porządkują pozostałe fragmenty update(), które zależą od
 * wieku dorosłego albo od profesjonalnych podsumowań metabolicznych. Nie
 * zmieniają obliczeń klinicznych; zachowują dotychczasowe warunki i tylko
 * centralizują ich wykonanie.
 * ========================================================================== */
function vildaUpdatePrepIsAdultAgeValue(age) {
  const numericAge = Number(age);
  if (!Number.isFinite(numericAge)) return false;
  try {
    if (typeof patientReportIsAdultAge === 'function') {
      return !!patientReportIsAdultAge(numericAge);
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-adult-metrics', 'Nie udało się ocenić wieku dorosłego przez patientReportIsAdultAge().', error, { age: numericAge });
    }
  }
  return numericAge >= 18;
}

function vildaUpdatePrepGetAdultMetricsElements(options = {}) {
  const supplied = options.elements || {};
  return {
    bpCard: supplied.bpCard || vildaUpdatePrepGetElement('bpCard'),
    circSection: supplied.circSection || vildaUpdatePrepGetElement('circSection'),
    respiratoryCard: supplied.respiratoryCard || vildaUpdatePrepGetElement('respiratoryCard'),
    resultsModeToggleContainer: supplied.resultsModeToggleContainer || vildaUpdatePrepGetElement('resultsModeToggleContainer'),
    advancedGrowthSection: supplied.advancedGrowthSection || vildaUpdatePrepGetElement('advancedGrowthSection'),
    sourceToggleContainer: supplied.sourceToggleContainer || vildaUpdatePrepGetElement('dataToggleContainer'),
    sourcePalczewska: supplied.sourcePalczewska || vildaUpdatePrepGetElement('sourcePalczewska'),
    sourceOlaf: supplied.sourceOlaf || vildaUpdatePrepGetElement('sourceOlaf'),
    sourceWho: supplied.sourceWho || vildaUpdatePrepGetElement('sourceWho')
  };
}

function vildaUpdatePrepSetDisplay(element, value) {
  if (element) element.style.display = value;
}

function vildaUpdatePrepUpdateAgeDependentAdultVisibility(context, options = {}) {
  const values = (context && context.inputState && context.inputState.values) || {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const elements = vildaUpdatePrepGetAdultMetricsElements(options);
  const isAdultAge = vildaUpdatePrepIsAdultAgeValue(age);
  const state = {
    age,
    isAdultAge,
    hiddenForAdult: ['bpCard', 'circSection', 'respiratoryCard'].filter((key) => {
      const element = elements[key];
      return !!element && isAdultAge;
    })
  };

  vildaUpdatePrepSetDisplay(elements.bpCard, isAdultAge ? 'none' : '');
  vildaUpdatePrepSetDisplay(elements.circSection, isAdultAge ? 'none' : '');
  vildaUpdatePrepSetDisplay(elements.respiratoryCard, isAdultAge ? 'none' : '');

  vildaUpdatePrepRunOptionalHook(context, 'adult-metrics', 'adultVitalsApi.refreshVisibility', () => {
    if (window.adultVitalsApi && typeof window.adultVitalsApi.refreshVisibility === 'function') {
      return window.adultVitalsApi.refreshVisibility();
    }
    return null;
  });

  vildaUpdatePrepRunOptionalHook(context, 'adult-metrics', 'syncResponsiveCardPlacements', () => {
    if (typeof window.syncResponsiveCardPlacements === 'function') {
      return window.syncResponsiveCardPlacements();
    }
    return null;
  });

  return state;
}

function vildaUpdatePrepUpdateResultsModeToggleContainer(context, options = {}) {
  const elements = vildaUpdatePrepGetAdultMetricsElements(options);
  if (elements.resultsModeToggleContainer) {
    elements.resultsModeToggleContainer.style.display = '';
  }
  return { shown: !!elements.resultsModeToggleContainer };
}

function vildaUpdatePrepUpdateAdvancedGrowthVisibility(context, options = {}) {
  const values = (context && context.inputState && context.inputState.values) || {};
  const age = Number(options.age != null ? options.age : values.age);
  const elements = vildaUpdatePrepGetAdultMetricsElements(options);
  const shouldShow = Number.isFinite(age) && age < 18;
  if (elements.advancedGrowthSection) {
    elements.advancedGrowthSection.style.display = shouldShow ? 'block' : 'none';
  }

  vildaUpdatePrepRunOptionalHook(context, 'adult-metrics', 'updateAdvancedGrowthAccess', () => {
    if (typeof updateAdvancedGrowthAccess === 'function') return updateAdvancedGrowthAccess();
    return null;
  });

  vildaUpdatePrepRunOptionalHook(context, 'adult-metrics', 'updatePalczewskaAccess', () => {
    if (typeof updatePalczewskaAccess === 'function') return updatePalczewskaAccess();
    return null;
  });

  return { shown: shouldShow, elementPresent: !!elements.advancedGrowthSection };
}

function vildaUpdatePrepHasAgeSourceInput() {
  const ageEl = vildaUpdatePrepGetElement('age');
  const monthsEl = vildaUpdatePrepGetElement('ageMonths');
  return !!(
    (ageEl && String(ageEl.value || '').trim() !== '') ||
    (monthsEl && String(monthsEl.value || '').trim() !== '')
  );
}

function vildaUpdatePrepUpdateGrowthDataSourceControls(context, options = {}) {
  try {
    const delegated = (typeof window !== 'undefined' && typeof window.updateGrowthDataSourceControls === 'function')
      ? window.updateGrowthDataSourceControls
      : null;
    if (delegated && delegated !== vildaUpdatePrepUpdateGrowthDataSourceControls) {
      return delegated(context, Object.assign({}, options || {}, {
        markSection: vildaUpdatePrepMarkSection
      }));
    }
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-adult-metrics', 'Delegacja do updateGrowthDataSourceControls() nie powiodła się; używam fallbacku VildaUpdatePrep.', error);
    }
  }


  const values = (context && context.inputState && context.inputState.values) || {};
  const hasExplicitAgeInput = vildaUpdatePrepHasAgeSourceInput();
  const rawAge = options.age != null ? Number(options.age) : Number(values.age);
  const age = Number.isFinite(rawAge) ? rawAge : 0;
  const elements = vildaUpdatePrepGetAdultMetricsElements(options);
  const state = {
    age,
    action: 'skipped',
    hasAgeSourceInput: hasExplicitAgeInput,
    controlsPresent: !!(elements.sourceToggleContainer && elements.sourcePalczewska && elements.sourceOlaf && elements.sourceWho)
  };

  if (!state.controlsPresent) {
    vildaUpdatePrepMarkSection(context, 'adult-metrics', 'mark', { action: 'growth-source-skipped', reason: 'missing-controls' });
    return state;
  }

  if (age > 18) {
    elements.sourceToggleContainer.style.display = 'none';
    if (typeof setCheckedGrowthDataSource === 'function') setCheckedGrowthDataSource('WHO');
    try {
      bmiSource = 'WHO';
    } catch (error) {
      if (typeof vildaLogAppWarn === 'function') {
        vildaLogAppWarn('app:update-adult-metrics', 'Nie udało się ustawić bmiSource na WHO dla osoby dorosłej.', error);
      }
    }
    if (typeof refreshGrowthChartActionControls === 'function') refreshGrowthChartActionControls();
    state.action = 'adult-force-who';
  } else if (!state.hasAgeSourceInput) {
    elements.sourceToggleContainer.style.display = 'none';
    const manualSelection = !!(elements.sourceToggleContainer.dataset && elements.sourceToggleContainer.dataset.manual === '1');
    const preferredSource = elements.sourceToggleContainer.dataset ? String(elements.sourceToggleContainer.dataset.preferredSource || '').toUpperCase() : '';
    if (manualSelection && ['PALCZEWSKA', 'OLAF', 'WHO'].includes(preferredSource)) {
      if (typeof setCheckedGrowthDataSource === 'function') setCheckedGrowthDataSource(preferredSource);
      try { bmiSource = preferredSource; } catch (_) {}
    } else {
      if (typeof setCheckedGrowthDataSource === 'function') setCheckedGrowthDataSource('OLAF');
      try { bmiSource = 'OLAF'; } catch (_) {}
    }
    if (typeof refreshGrowthChartActionControls === 'function') refreshGrowthChartActionControls();
    state.action = 'empty-age-default-olaf';
  } else {
    elements.sourceToggleContainer.style.display = 'flex';
    if (typeof syncGrowthDataSourceInputs === 'function') {
      try {
        bmiSource = syncGrowthDataSourceInputs({ ageYears: age });
      } catch (error) {
        if (typeof vildaLogAppWarn === 'function') {
          vildaLogAppWarn('app:update-adult-metrics', 'Nie udało się zsynchronizować źródła danych wzrastania.', error, { age });
        }
      }
    }
    state.action = 'child-sync-source';
  }

  vildaUpdatePrepMarkSection(context, 'adult-metrics', 'mark', {
    action: 'growth-source-controls',
    sourceAction: state.action,
    age: state.age
  });
  return state;
}

function vildaUpdatePrepRefreshAdultMetabolicRiskUi(context, options = {}) {
  const state = {
    metabolicSummaryVisibility: false,
    dietRecommendationsVisibility: false,
    professionalSummaryCard: false
  };

  state.metabolicSummaryVisibility = !!vildaUpdatePrepRunOptionalHook(context, 'adult-metrics', 'updateMetabolicSummaryVisibility', () => {
    if (typeof updateMetabolicSummaryVisibility === 'function') {
      updateMetabolicSummaryVisibility();
      return true;
    }
    return false;
  });

  state.dietRecommendationsVisibility = !!vildaUpdatePrepRunOptionalHook(context, 'adult-metrics', 'updateDietRecommendationsVisibility', () => {
    if (typeof updateDietRecommendationsVisibility === 'function') {
      updateDietRecommendationsVisibility();
      return true;
    }
    return false;
  });

  state.professionalSummaryCard = !!vildaUpdatePrepRunOptionalHook(context, 'adult-metrics', 'updateProfessionalSummaryCard', () => {
    if (typeof updateProfessionalSummaryCard === 'function') {
      updateProfessionalSummaryCard();
      return true;
    }
    return false;
  });

  return state;
}

function vildaUpdatePrepUpdateAdultMetrics(context, options = {}) {
  const values = (context && context.inputState && context.inputState.values) || {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const phase = options.phase || 'default';
  const state = {
    version: VILDA_UPDATE_PREP_VERSION,
    age,
    phase,
    visibility: null,
    resultsToggle: null,
    advancedGrowth: null,
    growthDataSource: null,
    metabolicRisk: null
  };

  vildaUpdatePrepMarkSection(context, 'adult-metrics', 'start', { age, phase });

  if (options.updateAgeDependentVisibility !== false) {
    state.visibility = vildaUpdatePrepUpdateAgeDependentAdultVisibility(context, options);
  }
  if (options.updateResultsToggle !== false) {
    state.resultsToggle = vildaUpdatePrepUpdateResultsModeToggleContainer(context, options);
  }
  if (options.updateAdvancedGrowth !== false) {
    state.advancedGrowth = vildaUpdatePrepUpdateAdvancedGrowthVisibility(context, options);
  }
  if (options.updateGrowthDataSource) {
    state.growthDataSource = vildaUpdatePrepUpdateGrowthDataSourceControls(context, options);
  }
  if (options.updateMetabolicRisk) {
    state.metabolicRisk = vildaUpdatePrepRefreshAdultMetabolicRiskUi(context, options);
  }

  vildaUpdatePrepMarkSection(context, 'adult-metrics', 'end', {
    age: state.age,
    phase: state.phase,
    visibility: state.visibility,
    growthDataSource: state.growthDataSource ? state.growthDataSource.action : null,
    metabolicRisk: state.metabolicRisk
  });

  return state;
}


/* ========================================================================== 
 * Krok 7G: opcjonalne hooki, czyszczenie kontenerów i post-render UI update()
 *
 * Te helpery domykają refaktor orkiestracji update(): wydzielają wywołania
 * modułów pobocznych, ochronę elementów przenoszonych w DOM, końcowe
 * przewijanie oraz diagnostykę zakończenia przebiegu. Nie zmieniają obliczeń.
 * ========================================================================== */
function vildaUpdatePrepRunPreValidationSynchronizers(context, options = {}) {
  const values = (context && context.inputState && context.inputState.values) || {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const state = {
    age,
    prevSummaryDiff: false,
    stabilizationEligibility: false,
    adultMetrics: null
  };

  vildaUpdatePrepMarkSection(context, 'optional-modules', 'start', { phase: 'pre-validation' });

  state.prevSummaryDiff = !!vildaUpdatePrepRunOptionalHook(context, 'optional-modules', 'updatePrevSummaryDiff', () => {
    if (typeof window !== 'undefined' && typeof window.updatePrevSummaryDiff === 'function') {
      window.updatePrevSummaryDiff();
      return true;
    }
    return false;
  });

  state.stabilizationEligibility = !!vildaUpdatePrepRunOptionalHook(context, 'optional-modules', 'updateStabilizationEligibility', () => {
    if (typeof window !== 'undefined' && typeof window.updateStabilizationEligibility === 'function') {
      window.updateStabilizationEligibility();
      return true;
    }
    return false;
  });

  state.adultMetrics = vildaUpdatePrepUpdateAdultMetrics(context, {
    age,
    phase: 'pre-validation',
    updateGrowthDataSource: false,
    updateMetabolicRisk: false
  });

  vildaUpdatePrepMarkSection(context, 'optional-modules', 'end', {
    phase: 'pre-validation',
    prevSummaryDiff: state.prevSummaryDiff,
    stabilizationEligibility: state.stabilizationEligibility
  });
  return state;
}

function vildaUpdatePrepPrepareSourceFieldsetForUpdate(context, options = {}) {
  const sourceFieldset = options.sourceFieldset || vildaUpdatePrepGetElement('sourceFieldset');
  const state = {
    sourceFieldset,
    present: !!sourceFieldset,
    visible: false,
    reason: 'missing-source-fieldset'
  };
  if (!sourceFieldset) {
    vildaUpdatePrepMarkSection(context, 'post-render', 'source-fieldset-prep-skipped', { reason: state.reason });
    return state;
  }

  const bodyEl = document.body;
  const hasSidebarClass = !!(bodyEl && bodyEl.classList && bodyEl.classList.contains('has-sidebar'));
  let isDesktopWidth = false;
  try {
    isDesktopWidth = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 992px)').matches;
  } catch (error) {
    if (typeof vildaLogAppWarn === 'function') {
      vildaLogAppWarn('app:update-post-render', 'Nie udało się sprawdzić szerokości okna dla sourceFieldset.', error);
    }
  }

  if (hasSidebarClass && isDesktopWidth) {
    sourceFieldset.style.display = 'block';
    state.visible = true;
    state.reason = 'desktop-sidebar-visible';
  } else {
    sourceFieldset.style.display = 'none';
    state.visible = false;
    state.reason = 'hidden-until-results';
  }

  vildaUpdatePrepMarkSection(context, 'post-render', 'source-fieldset-prepared', {
    visible: state.visible,
    reason: state.reason
  });
  return state;
}

function vildaUpdatePrepRefreshPalFactorDescription(context, options = {}) {
  const values = (context && context.inputState && context.inputState.values) || {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const palElem = options.palElem || vildaUpdatePrepGetElement('palFactor');
  const state = {
    present: !!palElem,
    age,
    value: null,
    updatedSelect: false,
    updatedDescription: false
  };
  if (!palElem) return state;

  const ageMonthsOpt = parseFloat(vildaUpdatePrepGetElement('ageMonths')?.value) || 0;
  const prevPal = palElem.value || '1.4';
  state.value = prevPal;

  state.updatedSelect = !!vildaUpdatePrepRunOptionalHook(context, 'optional-modules', 'energyPopulatePlanPalSelect', () => {
    if (typeof energyPopulatePlanPalSelect === 'function') {
      energyPopulatePlanPalSelect(palElem, {
        ageYears: age,
        ageMonthsOpt,
        value: prevPal
      });
      return true;
    }
    return false;
  });

  state.updatedDescription = !!vildaUpdatePrepRunOptionalHook(context, 'optional-modules', 'updatePalDescription', () => {
    if (typeof updatePalDescription === 'function') {
      updatePalDescription(palElem.value);
      return true;
    }
    return false;
  });
  state.value = palElem.value || prevPal;
  return state;
}

function vildaUpdatePrepPreparePreValidationUi(context, options = {}) {
  const values = (context && context.inputState && context.inputState.values) || {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const state = {
    age,
    sourceFieldset: null,
    sourceFieldsetState: null,
    pal: null,
    growthDataSource: null
  };

  vildaUpdatePrepMarkSection(context, 'post-render', 'start', { phase: 'pre-validation-ui' });
  state.sourceFieldsetState = vildaUpdatePrepPrepareSourceFieldsetForUpdate(context, options);
  state.sourceFieldset = state.sourceFieldsetState ? state.sourceFieldsetState.sourceFieldset : null;
  state.pal = vildaUpdatePrepRefreshPalFactorDescription(context, { age });
  state.growthDataSource = vildaUpdatePrepUpdateGrowthDataSourceControls(context, { age });
  vildaUpdatePrepMarkSection(context, 'post-render', 'end', {
    phase: 'pre-validation-ui',
    sourceFieldset: state.sourceFieldsetState ? state.sourceFieldsetState.reason : null,
    palValue: state.pal ? state.pal.value : null,
    growthDataSource: state.growthDataSource ? state.growthDataSource.action : null
  });
  return state;
}

function vildaUpdatePrepProtectBmrInfoChildren(context, options = {}) {
  const bmrInfo = options.bmrInfo || vildaUpdatePrepGetElement('bmrInfo');
  const protectedIds = Array.isArray(options.ids) ? options.ids : ['dataToggleContainer', 'centileButtons'];
  const state = {
    bmrInfoPresent: !!bmrInfo,
    moved: []
  };
  if (!bmrInfo) return state;

  protectedIds.forEach((id) => {
    const element = vildaUpdatePrepGetElement(id);
    if (element && element.parentElement === bmrInfo) {
      try {
        bmrInfo.insertAdjacentElement('afterend', element);
        state.moved.push(id);
      } catch (error) {
        if (typeof vildaLogAppWarn === 'function') {
          vildaLogAppWarn('app:update-post-render', 'Nie udało się zabezpieczyć elementu przed czyszczeniem bmrInfo.', error, { id });
        }
      }
    }
  });

  if (state.moved.length) {
    vildaUpdatePrepMarkSection(context, 'post-render', 'protected-bmr-children', { moved: state.moved.slice() });
  }
  return state;
}

function vildaUpdatePrepResetResultContainers(context, options = {}) {
  const elements = {
    bmrInfo: options.bmrInfo || vildaUpdatePrepGetElement('bmrInfo'),
    timesDiv: options.timesDiv || vildaUpdatePrepGetElement('foodTimes'),
    results: options.results || (context && context.inputState && context.inputState.elements ? context.inputState.elements.results : null) || vildaUpdatePrepGetElement('results'),
    foodTimesSection: options.foodTimesSection || vildaUpdatePrepGetElement('foodTimesSection')
  };
  const state = {
    protectedChildren: vildaUpdatePrepProtectBmrInfoChildren(context, { bmrInfo: elements.bmrInfo }),
    cleared: [],
    hidden: [],
    nutritionNormsCleared: false
  };

  if (elements.timesDiv) {
    vildaAppClearHtml(elements.timesDiv);
    state.cleared.push('foodTimes');
  }
  if (elements.bmrInfo) {
    vildaAppClearHtml(elements.bmrInfo);
    state.cleared.push('bmrInfo');
  }

  state.nutritionNormsCleared = !!vildaUpdatePrepRunOptionalHook(context, 'optional-modules', 'clearNutritionNormsCard', () => {
    if (typeof window !== 'undefined' && typeof window.clearNutritionNormsCard === 'function') {
      window.clearNutritionNormsCard();
      return true;
    }
    return false;
  });

  if (elements.results) {
    elements.results.style.display = 'none';
    state.hidden.push('results');
  }
  if (elements.foodTimesSection) {
    elements.foodTimesSection.style.display = 'none';
    state.hidden.push('foodTimesSection');
  }

  vildaUpdatePrepMarkSection(context, 'post-render', 'result-containers-reset', {
    cleared: state.cleared.slice(),
    hidden: state.hidden.slice(),
    protectedMoved: state.protectedChildren ? state.protectedChildren.moved : [],
    nutritionNormsCleared: state.nutritionNormsCleared
  });
  return state;
}

function vildaUpdatePrepShowSourceFieldsetAfterRender(context, options = {}) {
  const sourceFieldset = options.sourceFieldset || vildaUpdatePrepGetElement('sourceFieldset');
  const state = { shown: false, present: !!sourceFieldset };
  if (sourceFieldset) {
    sourceFieldset.style.display = 'block';
    state.shown = true;
  }
  vildaUpdatePrepMarkSection(context, 'post-render', 'source-fieldset-after-render', state);
  return state;
}

function vildaUpdatePrepScheduleResultsScroll(context, options = {}) {
  const delay = Number.isFinite(Number(options.delay)) ? Number(options.delay) : 150;
  const state = { scheduled: false, delay, reason: null };
  if (options.enabled === false) {
    state.reason = 'disabled';
    vildaUpdatePrepMarkSection(context, 'post-render', 'scroll-skipped', state);
    return state;
  }
  state.scheduled = true;
  vildaUpdatePrepMarkSection(context, 'post-render', 'scroll-scheduled', { delay });

  setTimeout(() => {
    try {
      const active = document.activeElement;
      const ageInp = document.getElementById('age');
      const weightInp = document.getElementById('weight');
      const heightInp = document.getElementById('height');
      if (active === ageInp || active === weightInp || active === heightInp) {
        return;
      }
      const cardEl = document.getElementById('bmiCard');
      if (cardEl && typeof scrollToResultsCard === 'function') {
        scrollToResultsCard();
      }
    } catch (error) {
      if (typeof vildaLogAppWarn === 'function') {
        vildaLogAppWarn('app:update-post-render', 'Nie udało się wykonać przewinięcia do wyników.', error);
      }
    }
  }, delay);
  return state;
}

function vildaUpdatePrepRunPostRenderSynchronization(context, options = {}) {
  const values = (context && context.inputState && context.inputState.values) || {};
  const age = Number(options.age != null ? options.age : values.age) || 0;
  const state = {
    age,
    adultMetrics: null
  };

  state.adultMetrics = vildaUpdatePrepUpdateAdultMetrics(context, {
    age,
    phase: 'post-render',
    updateAgeDependentVisibility: false,
    updateResultsToggle: false,
    updateAdvancedGrowth: false,
    updateGrowthDataSource: false,
    updateMetabolicRisk: true
  });
  vildaUpdatePrepMarkSection(context, 'post-render', 'synchronization-complete', { age });
  return state;
}

function vildaUpdatePrepCompleteMainUpdate(context, options = {}) {
  const postRenderState = vildaUpdatePrepRunPostRenderSynchronization(context, options);
  return vildaUpdatePrepFinishRun(context, options.status || 'completed', {
    postRender: postRenderState
  });
}

/* ========================================================================== 
 * Krok 7H: końcowy przegląd update() jako orkiestratora.
 *
 * Ten blok dodaje jawną mapę przepływu, ujednolica publiczne aliasy oraz
 * ogranicza powtórne odczyty DOM w samym update(). Nie zmienia obliczeń.
 * ========================================================================== */
function vildaUpdatePrepGetOrchestratorElements(context, preValidationUiState) {
  const inputElements = (context && context.inputState && context.inputState.elements) || {};
  return {
    sourceFieldset: (preValidationUiState && preValidationUiState.sourceFieldset) || inputElements.sourceFieldset || vildaUpdatePrepGetElement('sourceFieldset'),
    planCard: inputElements.planCard || vildaUpdatePrepGetElement('planCard'),
    planResults: inputElements.planResults || vildaUpdatePrepGetElement('planResults'),
    dietCalorieInfo: inputElements.dietCalorieInfo || vildaUpdatePrepGetElement('dietCalorieInfo'),
    planWarning: inputElements.planWarning || vildaUpdatePrepGetElement('planWarning'),
    childConsultCard: inputElements.childConsultCard || vildaUpdatePrepGetElement('childConsultCard'),
    results: inputElements.results || vildaUpdatePrepGetElement('results'),
    timesDiv: inputElements.foodTimes || vildaUpdatePrepGetElement('foodTimes'),
    foodTimesSection: inputElements.foodTimesSection || vildaUpdatePrepGetElement('foodTimesSection'),
    bmrInfo: inputElements.bmrInfo || vildaUpdatePrepGetElement('bmrInfo'),
    toNormCard: inputElements.toNormCard || vildaUpdatePrepGetElement('toNormCard'),
    toNormInfo: inputElements.toNormInfo || vildaUpdatePrepGetElement('toNormInfo')
  };
}

function vildaUpdatePrepResolveAliasTarget(aliasTarget) {
  const targets = {
    'VildaUpdatePrep.getDiagnostics': vildaUpdatePrepGetDiagnostics,
    'VildaUpdatePrep.getLastRun': vildaUpdatePrepGetLastRun,
    'VildaUpdatePrep.getOrchestratorMap': vildaUpdatePrepGetOrchestratorMap,
    'VildaUpdatePrep.dumpOrchestratorMap': vildaUpdatePrepDumpOrchestratorMap,
    'VildaUpdatePrep.getAppModularizationAudit': vildaUpdatePrepGetAppModularizationAudit,
    'VildaUpdatePrep.dumpAppModularizationAudit': vildaUpdatePrepDumpAppModularizationAudit,
    'VildaUpdatePrep.getNextExtractionCandidate': vildaUpdatePrepGetNextExtractionCandidate,
    'VildaUpdatePrep.getDataImportExportAudit': vildaUpdatePrepGetDataImportExportAudit,
    'VildaUpdatePrep.dumpDataImportExportAudit': vildaUpdatePrepDumpDataImportExportAudit,
    'VildaUpdatePrep.getDataImportExportExtractionPlan': vildaUpdatePrepGetDataImportExportExtractionPlan,
    'VildaUpdatePrep.getNextDataImportExportExtractionStep': vildaUpdatePrepGetNextDataImportExportExtractionStep,
    'VildaUpdatePrep.getDataImportExportRiskSummary': vildaUpdatePrepGetDataImportExportRiskSummary,
    'VildaUpdatePrep.getDataImportExportFinalAudit': vildaUpdatePrepGetDataImportExportFinalAudit,
    'VildaUpdatePrep.dumpDataImportExportFinalAudit': vildaUpdatePrepDumpDataImportExportFinalAudit,
    'VildaUpdatePrep.getAdvancedGrowthBoundaryAudit': vildaUpdatePrepGetAdvancedGrowthBoundaryAudit,
    'VildaUpdatePrep.dumpAdvancedGrowthBoundaryAudit': vildaUpdatePrepDumpAdvancedGrowthBoundaryAudit,
    'VildaUpdatePrep.getAdvancedGrowthExtractionPlan': vildaUpdatePrepGetAdvancedGrowthExtractionPlan,
    'VildaUpdatePrep.getNextAdvancedGrowthExtractionStep': vildaUpdatePrepGetNextAdvancedGrowthExtractionStep,
    'VildaUpdatePrep.getAdvancedGrowthRiskSummary': vildaUpdatePrepGetAdvancedGrowthRiskSummary,
    'VildaUpdatePrep.runMainUpdate': vildaUpdatePrepRunMainUpdate,
    'VildaUpdatePrep.readMainInputs': vildaUpdatePrepReadMainInputs,
    'VildaUpdatePrep.validateMainInputs': vildaUpdatePrepValidateMainInputs,
    'VildaUpdatePrep.handleEntryGuard': vildaUpdatePrepHandleEntryGuard,
    'VildaUpdatePrep.handleInputValidation': vildaUpdatePrepHandleInputValidation,
    'VildaUpdatePrep.updateFoodSummary': vildaUpdatePrepUpdateFoodSummary,
    'VildaUpdatePrep.updateFoodBurnSummary': vildaUpdatePrepUpdateFoodBurnSummary,
    'VildaUpdatePrep.renderBmiBmrResults': vildaUpdatePrepRenderBmiBmrResults,
    'VildaUpdatePrep.renderWeightHeightCentileCard': vildaUpdatePrepRenderWeightHeightCentileCard,
    'VildaUpdatePrep.updateChildMetrics': vildaUpdatePrepUpdateChildMetrics,
    'VildaUpdatePrep.updateBmiNormalizationAndPlan': vildaUpdatePrepUpdateBmiNormalizationAndPlan,
    'VildaUpdatePrep.updateAdultMetrics': vildaUpdatePrepUpdateAdultMetrics,
    'VildaUpdatePrep.updateGrowthDataSourceControls': vildaUpdatePrepUpdateGrowthDataSourceControls,
    'VildaUpdatePrep.runPreValidationSynchronizers': vildaUpdatePrepRunPreValidationSynchronizers,
    'VildaUpdatePrep.runPostRenderSynchronization': vildaUpdatePrepRunPostRenderSynchronization
  };
  return targets[aliasTarget] || null;
}

function vildaUpdatePrepInstallPublicAliases(targetWindow) {
  const w = targetWindow || (typeof window !== 'undefined' ? window : null);
  if (!w) return [];
  const installed = [];
  VILDA_UPDATE_PUBLIC_ALIAS_MAP.forEach((definition) => {
    const fn = vildaUpdatePrepResolveAliasTarget(definition.target);
    if (!definition.alias || typeof fn !== 'function') return;
    if (typeof w[definition.alias] === 'undefined') {
      w[definition.alias] = fn;
    }
    installed.push(definition.alias);
  });
  return installed;
}

function vildaUpdatePrepRunMainUpdate(thisArg, argsLike, updateFn) {
  const mainUpdateContext = vildaUpdatePrepCreateContext();
  const mainInputState = mainUpdateContext.inputState;
  const mainValidationState = mainUpdateContext.validation;
  const mainEntryGuard = vildaUpdatePrepHandleEntryGuard(mainUpdateContext, updateFn || null, thisArg, argsLike);
  if (!mainEntryGuard.shouldContinue) {
    return mainEntryGuard.result;
  }

  const mainDomGuard = vildaUpdatePrepHandleMissingRequiredDom(mainUpdateContext);
  if (!mainDomGuard.shouldContinue) return;
  vildaUpdatePrepMarkSection(mainUpdateContext, 'input-read', 'end', { values: mainInputState.values });
  const { weight, age, height, sex } = mainInputState.values;

  vildaUpdatePrepRunPreValidationSynchronizers(mainUpdateContext, { age });
  const preValidationUiState = vildaUpdatePrepPreparePreValidationUi(mainUpdateContext, { age });
  const mainOrchestratorElements = vildaUpdatePrepGetOrchestratorElements(mainUpdateContext, preValidationUiState);
  const sourceFieldset = mainOrchestratorElements.sourceFieldset;

  const mainValidationGate = vildaUpdatePrepHandleInputValidation(mainUpdateContext);
  if (!mainValidationGate.shouldContinue) return;

  const planCard = mainOrchestratorElements.planCard;
  const planResults = mainOrchestratorElements.planResults;
  const dietCalInfo = mainOrchestratorElements.dietCalorieInfo;
  const planWarningEl = mainOrchestratorElements.planWarning;
  const childConsultCard = mainOrchestratorElements.childConsultCard;
  const bmiNormalizationElements = {
    planCard,
    planResults,
    dietCalorieInfo: dietCalInfo,
    planWarning: planWarningEl,
    childConsultCard
  };
  vildaUpdatePrepResetBmiNormalizationUi(mainUpdateContext, {
    resetToNorm: false,
    elements: bmiNormalizationElements
  });

  const bmiReady = mainValidationState.bmiReady;
  const bmrReady = mainValidationState.bmrReady;
  const foodSummaryState = vildaUpdatePrepUpdateFoodSummary(mainUpdateContext, { weight, age });

  const results = mainOrchestratorElements.results;
  const timesDiv = mainOrchestratorElements.timesDiv;
  const foodTimesSection = mainOrchestratorElements.foodTimesSection;
  const bmrInfo = mainOrchestratorElements.bmrInfo;
  const toNormCard = mainOrchestratorElements.toNormCard;
  const toNormInfo = mainOrchestratorElements.toNormInfo;
  const fullBmiNormalizationElements = Object.assign({}, bmiNormalizationElements, {
    toNormCard,
    toNormInfo
  });

  vildaUpdatePrepResetBmiNormalizationUi(mainUpdateContext, {
    resetPlan: false,
    elements: fullBmiNormalizationElements
  });

  vildaUpdatePrepResetResultContainers(mainUpdateContext, {
    bmrInfo,
    timesDiv,
    results,
    foodTimesSection
  });

  const bmiBmrState = vildaUpdatePrepComputeBmiBmrState(mainUpdateContext, {
    age,
    weight,
    height,
    sex,
    bmiReady,
    bmrReady
  });

  if (bmiReady) {
    const weightHeightCentileResult = vildaUpdatePrepRenderWeightHeightCentileCard(mainUpdateContext, {
      age,
      weight,
      height,
      sex,
      professionalModeActive: professionalMode
    });
    vildaUpdatePrepRenderBmiBmrResults(mainUpdateContext, {
      bmiState: bmiBmrState,
      htmlPrefix: weightHeightCentileResult.html,
      bmrInfo
    });

    if (results) results.style.display = 'grid';
    vildaUpdatePrepScheduleResultsScroll(mainUpdateContext);
    vildaUpdatePrepShowSourceFieldsetAfterRender(mainUpdateContext, { sourceFieldset });

    vildaUpdatePrepUpdateChildMetrics(mainUpdateContext, {
      age,
      weight,
      height,
      sex,
      bmiState: bmiBmrState,
      professionalModeActive: professionalMode
    });
  }

  vildaUpdatePrepUpdateBmiNormalizationAndPlan(mainUpdateContext, {
    age,
    weight,
    height,
    sex,
    bmiReady,
    bmiState: bmiBmrState,
    professionalModeActive: professionalMode,
    elements: fullBmiNormalizationElements
  });

  vildaUpdatePrepUpdateFoodBurnSummary(mainUpdateContext, foodSummaryState, {
    weight,
    age,
    elements: { timesDiv, foodTimesSection }
  });

  return vildaUpdatePrepCompleteMainUpdate(mainUpdateContext, {
    age,
    status: 'completed'
  });
}


if (typeof window !== 'undefined') {
  window.VildaUpdatePrep = Object.freeze({
    VERSION: VILDA_UPDATE_PREP_VERSION,
    isMainCalculatorPage: vildaUpdatePrepIsMainCalculatorPage,
    runMainUpdate: vildaUpdatePrepRunMainUpdate,
    readMainInputs: vildaUpdatePrepReadMainInputs,
    validateMainInputs: vildaUpdatePrepValidateMainInputs,
    getNumericValidationSnapshot: vildaUpdatePrepGetNumericValidationSnapshot,
    getPediatricBmiClassificationSnapshot: vildaUpdatePrepGetPediatricBmiClassificationSnapshot,
    getPediatricBmiClassificationUnavailableLabel: vildaUpdatePrepGetPediatricBmiClassificationUnavailableLabel,
    isPediatricBmiClassificationUnavailable: vildaUpdatePrepIsPediatricBmiClassificationUnavailable,
    isFinitePositive: vildaUpdatePrepIsFinitePositive,
    isFiniteNonNegative: vildaUpdatePrepIsFiniteNonNegative,
    createContext: vildaUpdatePrepCreateContext,
    markSection: vildaUpdatePrepMarkSection,
    finishRun: vildaUpdatePrepFinishRun,
    runOptionalHook: vildaUpdatePrepRunOptionalHook,
    handleEntryGuard: vildaUpdatePrepHandleEntryGuard,
    handleMissingRequiredDom: vildaUpdatePrepHandleMissingRequiredDom,
    handleInputValidation: vildaUpdatePrepHandleInputValidation,
    updateFoodSummary: vildaUpdatePrepUpdateFoodSummary,
    updateFoodBurnSummary: vildaUpdatePrepUpdateFoodBurnSummary,
    computeBmiBmrState: vildaUpdatePrepComputeBmiBmrState,
    buildBmiResultHtml: vildaUpdatePrepBuildBmiResultHtml,
    renderBmiBmrResults: vildaUpdatePrepRenderBmiBmrResults,
    computeWeightHeightCentileState: vildaUpdatePrepComputeWeightHeightCentileState,
    buildWeightHeightCentileHtml: vildaUpdatePrepBuildWeightHeightCentileHtml,
    renderWeightHeightCentileCard: vildaUpdatePrepRenderWeightHeightCentileCard,
    updateChildMetrics: vildaUpdatePrepUpdateChildMetrics,
    resetBmiNormalizationUi: vildaUpdatePrepResetBmiNormalizationUi,
    updateBmiNormalizationAndPlan: vildaUpdatePrepUpdateBmiNormalizationAndPlan,
    updateAdultMetrics: vildaUpdatePrepUpdateAdultMetrics,
    updateGrowthDataSourceControls: vildaUpdatePrepUpdateGrowthDataSourceControls,
    refreshAdultMetabolicRiskUi: vildaUpdatePrepRefreshAdultMetabolicRiskUi,
    runPreValidationSynchronizers: vildaUpdatePrepRunPreValidationSynchronizers,
    preparePreValidationUi: vildaUpdatePrepPreparePreValidationUi,
    resetResultContainers: vildaUpdatePrepResetResultContainers,
    scheduleResultsScroll: vildaUpdatePrepScheduleResultsScroll,
    showSourceFieldsetAfterRender: vildaUpdatePrepShowSourceFieldsetAfterRender,
    runPostRenderSynchronization: vildaUpdatePrepRunPostRenderSynchronization,
    completeMainUpdate: vildaUpdatePrepCompleteMainUpdate,
    getOrchestratorElements: vildaUpdatePrepGetOrchestratorElements,
    installPublicAliases: vildaUpdatePrepInstallPublicAliases,
    hasPrevMeasurement: vildaUpdatePrepHasPrevMeasurement,
    getSectionMap: vildaUpdatePrepGetSectionMap,
    getOrchestratorMap: vildaUpdatePrepGetOrchestratorMap,
    dumpOrchestratorMap: vildaUpdatePrepDumpOrchestratorMap,
    getAppModularizationAudit: vildaUpdatePrepGetAppModularizationAudit,
    dumpAppModularizationAudit: vildaUpdatePrepDumpAppModularizationAudit,
    getNextExtractionCandidate: vildaUpdatePrepGetNextExtractionCandidate,
    getDataImportExportAudit: vildaUpdatePrepGetDataImportExportAudit,
    dumpDataImportExportAudit: vildaUpdatePrepDumpDataImportExportAudit,
    getDataImportExportExtractionPlan: vildaUpdatePrepGetDataImportExportExtractionPlan,
    getNextDataImportExportExtractionStep: vildaUpdatePrepGetNextDataImportExportExtractionStep,
    getDataImportExportRiskSummary: vildaUpdatePrepGetDataImportExportRiskSummary,
    getDataImportExportFinalAudit: vildaUpdatePrepGetDataImportExportFinalAudit,
    dumpDataImportExportFinalAudit: vildaUpdatePrepDumpDataImportExportFinalAudit,
    getAdvancedGrowthBoundaryAudit: vildaUpdatePrepGetAdvancedGrowthBoundaryAudit,
    dumpAdvancedGrowthBoundaryAudit: vildaUpdatePrepDumpAdvancedGrowthBoundaryAudit,
    getAdvancedGrowthExtractionPlan: vildaUpdatePrepGetAdvancedGrowthExtractionPlan,
    getNextAdvancedGrowthExtractionStep: vildaUpdatePrepGetNextAdvancedGrowthExtractionStep,
    getAdvancedGrowthRiskSummary: vildaUpdatePrepGetAdvancedGrowthRiskSummary,
    getAdvancedIntakeSyncAudit: vildaUpdatePrepGetAdvancedIntakeSyncAudit,
    dumpAdvancedIntakeSyncAudit: vildaUpdatePrepDumpAdvancedIntakeSyncAudit,
    getEstimatedIntakeCardAudit: vildaUpdatePrepGetEstimatedIntakeCardAudit,
    dumpEstimatedIntakeCardAudit: vildaUpdatePrepDumpEstimatedIntakeCardAudit,
    getEstimatedIntakeAlertProbeAudit: vildaUpdatePrepGetEstimatedIntakeAlertProbeAudit,
    dumpEstimatedIntakeAlertProbeAudit: vildaUpdatePrepDumpEstimatedIntakeAlertProbeAudit,
    getEstimatedIntakeCalcSeamAudit: vildaUpdatePrepGetEstimatedIntakeCalcSeamAudit,
    dumpEstimatedIntakeCalcSeamAudit: vildaUpdatePrepDumpEstimatedIntakeCalcSeamAudit,
    getEstimatedIntakeCalculationModelAudit: vildaUpdatePrepGetEstimatedIntakeCalculationModelAudit,
    dumpEstimatedIntakeCalculationModelAudit: vildaUpdatePrepDumpEstimatedIntakeCalculationModelAudit,
    getRegressionSmokeSuiteAudit: vildaUpdatePrepGetRegressionSmokeSuiteAudit,
    dumpRegressionSmokeSuiteAudit: vildaUpdatePrepDumpRegressionSmokeSuiteAudit,
    getNutritionNormsRefreshQueueAudit: vildaUpdatePrepGetNutritionNormsRefreshQueueAudit,
    dumpNutritionNormsRefreshQueueAudit: vildaUpdatePrepDumpNutritionNormsRefreshQueueAudit,
    getUpdateHooksRegistryAudit: vildaUpdatePrepGetUpdateHooksRegistryAudit,
    dumpUpdateHooksRegistryAudit: vildaUpdatePrepDumpUpdateHooksRegistryAudit,
    getUpdateHooksFirstWrapperBridgeAudit: vildaUpdatePrepGetUpdateHooksFirstWrapperBridgeAudit,
    dumpUpdateHooksFirstWrapperBridgeAudit: vildaUpdatePrepDumpUpdateHooksFirstWrapperBridgeAudit,
    getUpdateHooksFinalChainAudit: vildaUpdatePrepGetUpdateHooksFinalChainAudit,
    dumpUpdateHooksFinalChainAudit: vildaUpdatePrepDumpUpdateHooksFinalChainAudit,
    getCentileChartHeaderNameAudit: vildaUpdatePrepGetCentileChartHeaderNameAudit,
    dumpCentileChartHeaderNameAudit: vildaUpdatePrepDumpCentileChartHeaderNameAudit,
    getPublicAliases: vildaUpdatePrepGetPublicAliasMap,
    getRefactorPlan: vildaUpdatePrepGetRefactorPlan,
    getLastRun: vildaUpdatePrepGetLastRun,
    getDiagnostics: vildaUpdatePrepGetDiagnostics
  });
  vildaUpdatePrepInstallPublicAliases(window);
}
