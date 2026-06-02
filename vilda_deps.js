/*
 * Vilda Dependencies Helper v1.28.0
 *
 * Lekka warstwa diagnostyczna dla zależności ładowanych globalnie przez <script>.
 * Nie ładuje bibliotek dynamicznie; tylko bezpiecznie sprawdza ich obecność,
 * zwraca zależność albo fallback i emituje pojedyncze ostrzeżenia diagnostyczne.
 *
 * Od v1.1 zawiera jawny kontrakt zależności krytycznych dla eksportów,
 * wykresów i danych wzrastania. Od v1.2 zawiera wspólną warstwę
 * komunikatów fallback dla brakujących zależności.
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaDeps && global.VildaDeps.__vildaDepsHelper) {
    return;
  }

  const VERSION = '1.29.0';
  const MAX_EVENTS = 300;
  const MAX_CHECKS = 120;
  const MAX_NOTICES = 120;
  const missingEvents = [];
  const contractCheckEvents = [];
  const noticeEvents = [];
  const lastNoticeByKey = Object.create(null);
  const warned = Object.create(null);
  const moduleContracts = Object.create(null);
  const loadOrderRules = [];
  let debugEnabled = false;

  const DEPENDENCY_LABELS = {
    'jspdf.jsPDF': 'jsPDF',
    'html2canvas': 'html2canvas',
    'XLSX': 'SheetJS XLSX',
    'docx': 'docx.js',
    'docx.Packer': 'docx.Packer',
    'pdfMake': 'pdfMake',
    'pdfMake.createPdf': 'pdfMake.createPdf',
    'pdfMake.vfs': 'pdfMake.vfs',
    'Chart': 'Chart.js',
    'centileData': 'dane centylowe',
    'generateCentileChart': 'generator siatek centylowych',
    'generatePalczewskaCentileCharts': 'generator siatek Palczewskiej',
    'getCentileChartState': 'stan siatek centylowych',
    'buildCentilePageCanvas': 'render siatek centylowych',
    'getEffectiveCentileGrowthDataState': 'dane wzrastania dla siatek',
    'collectAllAgesMonths': 'kolektor wieku dla siatek',
    'bayleyPinneauData': 'dane Bayley-Pinneau',
    'rwtData': 'dane RWT',
    'reinehrCdgpData': 'dane Reinehr/CDGP',
    'advGrowthCalculateReinehrCdgpPrediction': 'predykcja Reinehr/CDGP',
    'advGrowthCollectHistoricalPointsForReport': 'historia wzrastania do raportu',
    'generateAdvancedGrowthPdfReport': 'generator raportu wzrastania',
    'advGrowthBuildReportRows': 'wiersze raportu wzrastania',
    'advGrowthBuildHtmlReportMarkup': 'HTML raportu wzrastania',
    'SGA_INTERGROWTH_ZS': 'dane SGA Intergrowth',
    'SGA_MALEWSKI_WEIGHT': 'dane SGA Malewski',
    'DS': 'dane LMS dla zespołu Downa',
    'VildaDownSyndrome': 'moduł centyli zespołu Downa',
    'VildaAnorexiaRisk': 'moduł ryzyka anoreksji',
    'detectAnRisk': 'detektor ryzyka anoreksji',
    'anorexiaRiskAdjust': 'korekta TEE przy ryzyku anoreksji',
    'vildaGetAdvancedIntakeSyncAuditSnapshot': 'diagnostyka synchronizacji advanced growth ↔ estimated intake',
    'vildaGetEstimatedIntakeAuditSnapshot': 'diagnostyka karty estimated intake przed wydzieleniem',
    'vildaGetEstimatedIntakeAlertProbeAuditSnapshot': 'diagnostyka funkcji alert-probe estimated intake',
    'readIntakeRows': 'odczyt wierszy estimated intake',
    'getIntakeRowHeight': 'odczyt wzrostu wiersza estimated intake z fallbackiem',
    'buildIntakeIntervals': 'budowanie interwałów estimated intake',
    'collectIntakeRowsForAlertProbe': 'kolektor wierszy do diagnostyki alertów estimated intake',
    'hasPotentialIntakeAlerts': 'detektor potencjalnych alertów estimated intake',
    'getUserBasics': 'odczyt podstawowych danych pacjenta',
    'energyBuildIntakeObservedState': 'model energetyczny observed state dla estimated intake',
    'energyIsNumeric': 'walidator liczbowy modelu energetycznego',
    'has12mLossOrangeRisk': 'detektor pomarańczowego ryzyka utraty masy 12m',
    'VildaEstimatedIntake': 'moduł neutralnych helperów estimated intake',
    'VildaEstimatedIntake.readIntakeRows': 'modułowy odczyt wierszy estimated intake',
    'VildaEstimatedIntake.getIntakeRowHeight': 'modułowy odczyt wzrostu wiersza estimated intake',
    'VildaEstimatedIntake.buildIntakeIntervals': 'modułowe budowanie interwałów estimated intake',
    'VildaEstimatedIntake.collectIntakeRowsForAlertProbe': 'modułowy kolektor wierszy do alert-probe estimated intake',
    'VildaEstimatedIntake.getApiSurfaceStatus': 'diagnostyka API VildaEstimatedIntake',
    'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel': 'czysty model obliczeniowy estimated intake',
    'VildaEstimatedIntakeUI': 'moduł renderera wyników estimated intake',
    'VildaEstimatedIntakeUI.buildResultsHtml': 'czysty renderer wyników estimated intake',
    'VildaEstimatedIntakeUI.buildEmptyResultsHtml': 'renderer komunikatu pustych wierszy estimated intake',
    'VildaEstimatedIntakeUI.buildSingleRowResultsHtml': 'renderer pojedynczego wiersza estimated intake',
    'VildaEstimatedIntakeUI.buildIntervalResultsHtml': 'renderer interwałów estimated intake',
    'VildaEstimatedIntakeUI.getSnapshot': 'read-only snapshot renderera estimated intake',
    'vildaGetEstimatedIntakeUiSnapshot': 'globalny snapshot renderera estimated intake',
    'buildEstimatedIntakeResultsRenderModel': 'adapter render modelu estimated intake w app.js',
    'applyEstimatedIntakeResultsRenderModel': 'wrapper kontrolowanego mountu HTML estimated intake w app.js / VildaEstimatedIntakeDomMount',
    'VildaEstimatedIntakeRuntime': 'runtime efektów ubocznych estimated intake',
    'VildaEstimatedIntakeRuntime.buildEstimatedIntakeWindowHistory': 'budowanie window.intakeHistory dla estimated intake',
    'VildaEstimatedIntakeRuntime.clearEstimatedIntakeWindowState': 'czyszczenie window state estimated intake',
    'VildaEstimatedIntakeRuntime.commitEstimatedIntakeWindowState': 'commit window state estimated intake',
    'VildaEstimatedIntakeRuntime.commitEstimatedIntakeCalcModelWindowState': 'commit window state z calc modelu estimated intake',
    'VildaEstimatedIntakeRuntime.runEstimatedIntakePostRenderRisk': 'post-render risk checks estimated intake',
    'VildaEstimatedIntakeRuntime.getSnapshot': 'read-only snapshot runtime estimated intake',
    'vildaGetEstimatedIntakeRuntimeSnapshot': 'globalny snapshot runtime estimated intake',
    'VildaEstimatedIntakeInputModel': 'adapter modelu wejściowego/observed estimated intake',
    'VildaEstimatedIntakeInputModel.buildEstimatedIntakeHistoryForRisk': 'budowanie historii ryzyka dla estimated intake',
    'VildaEstimatedIntakeInputModel.buildEstimatedIntakeCalcInputModel': 'budowanie inputModel estimated intake',
    'VildaEstimatedIntakeInputModel.buildEstimatedIntakeLastObservedModel': 'budowanie lastObservedModel estimated intake',
    'VildaEstimatedIntakeInputModel.getEstimatedIntakeCalculationModelDependencies': 'zależności modelu kalkulacyjnego estimated intake',
    'VildaEstimatedIntakeInputModel.getSnapshot': 'read-only snapshot adaptera input/observed estimated intake',
    'vildaGetEstimatedIntakeInputModelSnapshot': 'globalny snapshot adaptera input/observed estimated intake',
    'getVildaEstimatedIntakeInputModelAdapter': 'adapter input/observed estimated intake w app.js',
    'getVildaEstimatedIntakeInputModelDependencies': 'zależności input/observed estimated intake w app.js',
    'VildaEstimatedIntakeDomMount': 'adapter DOM mount wyników estimated intake',
    'VildaEstimatedIntakeDomMount.getEstimatedIntakeCalcOutputTargets': 'pobieranie targetów DOM estimated intake',
    'VildaEstimatedIntakeDomMount.describeEstimatedIntakeCalcTargets': 'opis targetów DOM estimated intake',
    'VildaEstimatedIntakeDomMount.getEstimatedIntakeCalcBranch': 'wybór gałęzi mountu estimated intake',
    'VildaEstimatedIntakeDomMount.applyEstimatedIntakeResultsRenderModel': 'kontrolowany mount renderModel.html estimated intake',
    'VildaEstimatedIntakeDomMount.hideEstimatedIntakeLegend': 'kontrolowane ukrycie legendy estimated intake',
    'VildaEstimatedIntakeDomMount.getSnapshot': 'read-only snapshot adaptera DOM mount estimated intake',
    'vildaGetEstimatedIntakeDomMountSnapshot': 'globalny snapshot adaptera DOM mount estimated intake',
    'getVildaEstimatedIntakeDomMountAdapter': 'adapter DOM mount estimated intake w app.js',
    'getVildaEstimatedIntakeDomMountDependencies': 'zależności DOM mount estimated intake w app.js',
    'hideEstimatedIntakeLegend': 'wrapper ukrycia legendy estimated intake w app.js',
    'buildEstimatedIntakeCalcInputModelFallback': 'fallback inputModel estimated intake w app.js',
    'buildEstimatedIntakeLastObservedModelFallback': 'fallback lastObservedModel estimated intake w app.js',
    'getVildaEstimatedIntakeRuntimeAdapter': 'adapter runtime estimated intake w app.js',
    'getVildaEstimatedIntakeRuntimeDependencies': 'zależności runtime estimated intake w app.js',
    'VildaGrowthReferenceData': 'moduł statycznych danych referencyjnych BMI/LMS/WHO-WFL',
    'VildaGrowthReferenceData.getData': 'read-only dostęp do statycznych danych BMI/LMS/WHO-WFL',
    'VildaGrowthReferenceData.getSnapshot': 'read-only snapshot statycznych danych BMI/LMS/WHO-WFL',
    'vildaGetGrowthReferenceDataSnapshot': 'globalny snapshot statycznych danych BMI/LMS/WHO-WFL',
    'VildaGrowthReferenceData.WFL_DATA_GIRLS': 'WHO WFL LMS dziewczynki 45–110 cm',
    'VildaGrowthReferenceData.WFL_DATA_BOYS': 'WHO WFL LMS chłopcy 45–110 cm',
    'VildaGrowthReferenceData.bmiPercentiles': 'percentyle BMI 24–228 miesięcy',
    'VildaGrowthReferenceData.LMS_BOYS': 'LMS BMI chłopcy 24–228 miesięcy',
    'VildaGrowthReferenceData.LMS_GIRLS': 'LMS BMI dziewczynki 24–228 miesięcy',
    'VildaGrowthReferenceData.LMS_INFANT_BOYS': 'LMS BMI niemowlęta/chłopcy 0–60 miesięcy',
    'VildaGrowthReferenceData.LMS_INFANT_GIRLS': 'LMS BMI niemowlęta/dziewczynki 0–60 miesięcy',
    'VildaGrowthReferenceData.bmiInfantBoys': 'percentyle BMI niemowlęta/chłopcy 0–60 miesięcy',
    'VildaGrowthReferenceData.bmiInfantGirls': 'percentyle BMI niemowlęta/dziewczynki 0–60 miesięcy',
    'VildaPersistRuntime': 'moduł autosave/restore runtime',
    'VildaPersistRuntime.init': 'inicjalizacja autosave/restore runtime',
    'VildaPersistRuntime.getSnapshot': 'read-only snapshot autosave/restore runtime',
    'vildaGetPersistRuntimeSnapshot': 'globalny snapshot autosave/restore runtime',
    'VildaSummaryCards': 'moduł kart podsumowań/metabolic summary UI',
    'VildaSummaryCards.init': 'inicjalizacja kart podsumowań/metabolic summary UI',
    'VildaSummaryCards.getSnapshot': 'read-only snapshot kart podsumowań/metabolic summary UI',
    'vildaGetSummaryCardsSnapshot': 'globalny snapshot kart podsumowań/metabolic summary UI',
    'VildaDietPlanUI': 'moduł planu diety / energy plan renderer',
    'VildaDietPlanUI.init': 'inicjalizacja planu diety / energy plan renderer',
    'VildaDietPlanUI.initDietPlanUI': 'alias inicjalizacji planu diety / energy plan renderer',
    'VildaDietPlanUI.getSnapshot': 'read-only snapshot planu diety / energy plan renderer',
    'vildaGetDietPlanUiSnapshot': 'globalny snapshot planu diety / energy plan renderer',
    'updatePlanFromDiet': 'renderer planu diety',
    'fillDietSelect': 'uzupełnianie wyboru diety',
    'updateDietDescription': 'opis wybranej diety redukcyjnej',
    'updatePalDescription': 'opis współczynnika PAL',
    'BMR': 'wrapper REE/BMR modelu energetycznego',
    'energyBuildContext': 'model energetyczny / energy context',
    'energyBuildPlanReductionState': 'stan planu redukcji masy',
    'generateMetabolicSummary': 'generator karty metabolic summary',
    'handleMetabolicSummaryClick': 'handler kliknięcia metabolic summary',
    '__renderPrevSummary': 'render poprzedniego pomiaru w karcie BMI',
    '__renderPrevClcrSummary': 'render poprzedniego pomiaru w karcie klirensu',
    'repositionDoctor': 'layout karty lekarza',
    'repositionMetabolicSummary': 'layout karty metabolic summary',
    'vildaGetPersistAutosaveCoalescingSnapshot': 'snapshot koalescencji autosave persistence',
    'VildaSmokeTests': 'stały zestaw smoke testów regresyjnych',
    'VildaSmokeTests.runRegressionSuite': 'uruchomienie stałego zestawu smoke testów regresyjnych',
    'VildaSmokeTests.getManifest': 'manifest smoke testów regresyjnych',
    'VildaSmokeTests.getSnapshot': 'snapshot smoke testów regresyjnych',
    'vildaRunSmokeRegressionSuite': 'alias uruchomienia smoke testów regresyjnych',
    'vildaGetSmokeRegressionSuiteSnapshot': 'alias snapshotu smoke testów regresyjnych',
    'VildaFoodSummary': 'moduł podsumowania posiłków',
    'VildaFoodSummary.getNutritionNormsRefreshQueueSnapshot': 'snapshot kolejki refreshy nutritionNormsModelUpdated',
    'VildaFoodSummary.buildNutritionNormsRefreshSignature': 'sygnatura modelu norm żywieniowych dla refreshy food-summary',
    'macroPracticeInitNutritionNormsRefresh': 'inicjalizacja refreshy food-summary po zmianie norm żywieniowych',
    'macroPracticeRefreshFoodCardOnly': 'lokalny refresh karty posiłków',
    'macroPracticeGetNutritionNormsRefreshQueueSnapshot': 'globalny snapshot kolejki refreshy nutritionNormsModelUpdated',
    'vildaGetNutritionNormsRefreshQueueSnapshot': 'alias snapshotu kolejki refreshy nutritionNormsModelUpdated',
    'macroPracticeBuildNutritionNormsRefreshSignature': 'globalny builder sygnatury nutritionNormsModelUpdated',
    'VildaUpdateHooks': 'registry hooków wykonywanych po update()',
    'VildaUpdateHooks.registerAfterUpdateHook': 'rejestracja hooka po update()',
    'VildaUpdateHooks.unregisterAfterUpdateHook': 'wyrejestrowanie hooka po update()',
    'VildaUpdateHooks.runAfterUpdateHooks': 'uruchomienie hooków po update()',
    'VildaUpdateHooks.getSnapshot': 'read-only snapshot registry hooków update',
    'VildaUpdateHooks.getHookAuditSnapshot': 'read-only snapshot audytu registry hooków update',
    'VildaUpdateHooks.getFinalUpdateChainAuditSnapshot': 'końcowy read-only audyt łańcucha window.update',
    'vildaGetFinalUpdateChainAuditSnapshot': 'globalny alias końcowego audytu łańcucha window.update',
    'vildaGetUpdateHooksFinalChainAuditSnapshot': 'globalny alias audytu łańcucha window.update',
    'VildaUpdateHooks.getApiSurfaceStatus': 'diagnostyka API registry hooków update',
    'vildaRegisterAfterUpdateHook': 'globalny alias rejestracji hooka po update()',
    'vildaUnregisterAfterUpdateHook': 'globalny alias wyrejestrowania hooka po update()',
    'vildaRunAfterUpdateHooks': 'globalny alias uruchomienia hooków po update()',
    'vildaGetUpdateHooksSnapshot': 'globalny alias snapshotu registry hooków update',
    'vildaGetUpdateHooksAuditSnapshot': 'globalny alias audytu registry hooków update',
    'vildaGetUpdateHooksBridgeSnapshot': 'snapshot bridge pierwszego przepiętego wrappera window.update',
    '__vildaUpdateHooksBridge8O10dB': 'bridge window.update instalowany w app.js dla pierwszego przepiętego wrappera',
    '__vildaUpdateHooksBridge8O10dD': 'bridge window.update po przepięciu wrappera zaleceń dietetycznych',
    '__vildaUpdateHooksBridge8O10dF': 'bridge window.update po przepięciu wrappera nutrition_norms.js',
    '__vildaUpdateHooksBridge8O10dG': 'bridge window.update po przepięciu wrappera nutrition_micros.js',
    'VildaDietRecommendations': 'moduł zaleceń dietetycznych',
    'VildaDietRecommendations.updateVisibilityAfterUpdate': 'hook widoczności zaleceń dietetycznych po update()',
    'VildaDietRecommendations.getUpdateHookSnapshot': 'snapshot hooka update zaleceń dietetycznych',
    'vildaGetDietRecommendationsUpdateHookSnapshot': 'globalny snapshot hooka update zaleceń dietetycznych',
    '__vildaDietRecommendationsAfterUpdateHookId': 'identyfikator hooka update zaleceń dietetycznych',
    '__vildaDietRecommendationsAfterUpdateHookRegistered': 'flaga rejestracji hooka update zaleceń dietetycznych',
    '__vildaDietRecommendationsVisibilityAfterUpdateFallback': 'fallback hooka widoczności zaleceń dietetycznych',
    'VildaNutritionNorms': 'moduł/API norm żywieniowych',
    'VildaNutritionNorms.getUpdateHookSnapshot': 'snapshot hooka update norm żywieniowych',
    'VildaNutritionNorms.renderAfterUpdate': 'hook renderowania norm żywieniowych po update()',
    'nutritionNormsRenderAfterUpdate': 'hook renderowania karty norm żywieniowych po update()',
    'nutritionNormsRegisterAfterUpdateHook': 'rejestracja hooka norm żywieniowych po update()',
    'nutritionNormsGetUpdateHookSnapshot': 'snapshot hooka update norm żywieniowych',
    'vildaGetNutritionNormsUpdateHookSnapshot': 'globalny snapshot hooka update norm żywieniowych',
    '__vildaNutritionNormsAfterUpdateHookId': 'identyfikator hooka update norm żywieniowych',
    '__vildaNutritionNormsAfterUpdateHookRegistered': 'flaga rejestracji hooka update norm żywieniowych',
    '__vildaNutritionNormsAfterUpdateFallback': 'fallback hooka renderowania norm żywieniowych',
    'VildaNutritionMicros': 'moduł/API mikroelementów',
    'VildaNutritionMicros.getUpdateHookSnapshot': 'snapshot hooka update mikroelementów',
    'VildaNutritionMicros.renderAfterUpdate': 'hook renderowania mikroelementów po update()',
    'nutritionMicrosRenderAfterUpdate': 'hook renderowania karty mikroelementów po update()',
    'nutritionMicrosRegisterAfterUpdateHook': 'rejestracja hooka mikroelementów po update()',
    'nutritionMicrosGetUpdateHookSnapshot': 'snapshot hooka update mikroelementów',
    'vildaGetNutritionMicrosUpdateHookSnapshot': 'globalny snapshot hooka update mikroelementów',
    '__vildaNutritionMicrosAfterUpdateHookId': 'identyfikator hooka update mikroelementów',
    '__vildaNutritionMicrosAfterUpdateHookRegistered': 'flaga rejestracji hooka update mikroelementów',
    '__vildaNutritionMicrosAfterUpdateFallback': 'fallback hooka renderowania mikroelementów',
    'VildaCentileChartHeader': 'moduł świeżego nagłówka siatek centylowych',
    'VildaCentileChartHeader.buildHeaderNameState': 'odczyt świeżego imienia i nazwiska dla siatek centylowych',
    'VildaCentileChartHeader.buildNameLabel': 'etykieta imienia i nazwiska dla PDF siatek centylowych',
    'VildaCentileChartHeader.getSnapshot': 'read-only snapshot nagłówka siatek centylowych',
    'VildaCentileChartHeader.markNameInputEdit': 'rejestracja ostatnio edytowanego pola imienia dla siatek',
    'vildaGetCentileChartHeaderNameSnapshot': 'globalny snapshot nagłówka siatek centylowych',
    'vildaGetCentileChartHeaderNameState': 'globalny stan nagłówka siatek centylowych',
    'vildaBuildCentileChartNameLabel': 'globalny builder etykiety imienia dla siatek centylowych',
    'VildaGHTherapyResourceAudit': 'read-only audyt IndexedDB/BroadcastChannel/MutationObserver terapii GH/IGF',
    'VildaGHTherapyResourceAudit.getSnapshot': 'snapshot audytu zasobów GH therapy',
    'VildaGHTherapyResourceAudit.getGHTherapyIndexedDbAuditSnapshot': 'snapshot audytu IndexedDB terapii GH/IGF',
    'VildaGHTherapyResourceAudit.getApiSurfaceStatus': 'diagnostyka API audytu zasobów GH therapy',
    'vildaGetGHTherapyIndexedDbAuditSnapshot': 'globalny snapshot audytu IndexedDB terapii GH/IGF',
    'vildaGetGHTherapyResourceAuditSnapshot': 'globalny snapshot audytu zasobów terapii GH/IGF',
    'getCentileChartHeaderNameState': 'lokalny/globalny stan nagłówka siatek centylowych',
    'buildCentileChartNameLabel': 'lokalny/globalny builder etykiety imienia dla siatek centylowych',
    'vildaToFiniteNumber': 'jawna normalizacja liczbowa 8O-10a',
    'vildaIsFinitePositive': 'walidator wartości dodatnich 8O-10a',
    'vildaIsFiniteNonNegative': 'walidator wartości nieujemnych 8O-10a',
    'vildaReadNumericInputState': 'read-only stan pola liczbowego 8O-10a',
    'vildaGetMainAgeInputState': 'read-only stan wieku głównego formularza 8O-10a',
    'vildaGetMainAnthroValidationSnapshot': 'read-only snapshot walidacji wieku/masy/wzrostu 8O-10a',
    'vildaGetNumericValidationAuditSnapshot': 'audyt walidacji liczbowej age=0',
    'VildaUpdatePrep.getNumericValidationSnapshot': 'snapshot walidacji liczbowej w VildaUpdatePrep',
    'VildaUpdatePrep.isFinitePositive': 'walidator dodatni VildaUpdatePrep',
    'VildaUpdatePrep.isFiniteNonNegative': 'walidator nieujemny VildaUpdatePrep',
    'VildaDataImportExport.version': 'wersja modułu import/export JSON',
    'VildaAdvancedGrowth.advIntakeGetIntakeRows': 'helper odczytu wierszy estimated intake',
    'VildaAdvancedGrowth.advIntakeGetAdvancedRows': 'helper odczytu wierszy advanced growth',
    'VildaAdvancedGrowth.advIntakeGetIntakeHistoryRows': 'helper odczytu historycznych wierszy intake',
    'VildaAdvancedGrowth.advIntakeGetSyncId': 'helper odczytu data-adv-intake-sync-id',
    'VildaAdvancedGrowth.advIntakeSetSyncId': 'helper zapisu data-adv-intake-sync-id',
    'VildaAdvancedGrowth.advIntakeAdvRowAgeMonths': 'helper wieku wiersza advanced growth',
    'VildaAdvancedGrowth.advIntakeIntakeRowAgeMonths': 'helper wieku wiersza intake',
    'VildaAdvancedGrowth.advIntakeAdvRowHasAnyData': 'detekcja danych w wierszu advanced growth',
    'VildaAdvancedGrowth.advIntakeIntakeRowHasAnyData': 'detekcja danych w wierszu intake',
    'VildaAdvancedGrowth.advIntakeBuildAuditSnapshot': 'modułowy snapshot diagnostyczny advanced ↔ intake',
    'VildaAdvancedGrowth.copyAdvancedIntakeValueIfTargetEmpty': 'kopiowanie pustego pola advanced ↔ intake',
    'VildaAdvancedGrowth.backfillAdvancedIntakeHistoryRowFromAdvancedRow': 'backfill intake z wiersza advanced growth',
    'VildaAdvancedGrowth.backfillAdvancedIntakeAdvancedRowFromHistoryRow': 'backfill advanced growth z wiersza intake',
    'VildaAdvancedGrowth.syncAdvancedIntakeAdvancedRowToHistoryRow': 'kopiowanie wiersza advanced growth do intake',
    'VildaAdvancedGrowth.syncAdvancedIntakeHistoryRowToAdvancedRow': 'kopiowanie wiersza intake do advanced growth',
    'VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder': 'modułowe parowanie list wierszy advanced growth ↔ estimated intake',
    'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementAdd': 'modułowy handler dodania wiersza advanced growth',
    'VildaAdvancedGrowth.handleAdvancedIntakeHistoryAdd': 'modułowy handler dodania wiersza intake',
    'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementRowRemove': 'modułowy handler usunięcia wiersza advanced growth',
    'VildaAdvancedGrowth.handleAdvancedIntakeHistoryRowRemove': 'modułowy handler usunięcia wiersza intake',
    '_getAdvIntakeHandlerOptions': 'adapter zależności handlerów add/remove advanced ↔ intake',
    '_pairAdvancedAndIntakeRowsByOrder': 'parowanie wierszy advanced growth ↔ intake',
    '_syncAdvRowToIntake': 'synchronizacja wiersza advanced growth do intake',
    '_syncIntakeRowToAdv': 'synchronizacja wiersza intake do advanced growth',
    'handleAdvancedMeasurementAdd': 'dodanie sparowanego wiersza advanced growth',
    'handleIntakeHistoryAdd': 'dodanie sparowanego wiersza intake',
    'handleAdvancedMeasurementRowRemove': 'usunięcie sparowanego wiersza advanced growth',
    'handleIntakeHistoryRowRemove': 'usunięcie sparowanego wiersza intake',
    'VildaAdvancedGrowth.setupAdvancedIntakeLiveWiring': 'modułowy event wiring synchronizacji advanced growth ↔ estimated intake',
    'setupAdvancedIntakeLiveWiring': 'wrapper event wiring synchronizacji advanced growth ↔ estimated intake',
    'window.vildaEnsureAdvancedIntakePairing': 'globalny alias wymuszenia parowania advanced growth ↔ estimated intake',
    'window.vildaHandleAdvancedMeasurementAdd': 'globalny alias dodania wiersza advanced growth',
    'window.vildaHandleIntakeHistoryAdd': 'globalny alias dodania wiersza intake',
    'window.vildaHandleAdvancedMeasurementRowRemove': 'globalny alias usunięcia wiersza advanced growth',
    'window.vildaHandleIntakeHistoryRowRemove': 'globalny alias usunięcia wiersza intake',
    'VildaDataImportExport.hasMeaningfulMainSessionData': 'guard semantyczny pustego autosave po clear/import JSON',
    'clearAllData': 'pełne czyszczenie formularza i autosave',
    'restoreLoadedState': 'odtworzenie wczytanego stanu JSON',
    'calcEstimatedIntake': 'obliczenie szacowanego spożycia energii',
    'intakeAddRow': 'dodanie wiersza historii estimated intake',
    'calculateGrowthAdvanced': 'globalny wrapper calculateGrowthAdvanced()',
    'importTherapyPointsToAdvancedGrowth': 'globalny import punktów GH/IGF do advanced growth',
    'generateAdvancedGrowthPdfReport': 'globalny raport PDF advanced growth',
    'advGrowthBuildHtmlReportMarkup': 'globalny HTML raportu advanced growth'
  };

  const MODULE_LABELS = {
    'main-bmi-metabolism-pdf': 'raport BMI/metabolizmu',
    'diet-recommendations-pdf': 'raport zaleceń dietetycznych PDF',
    'patient-report-pdf': 'raport pacjenta PDF',
    'patient-report-visit-pages': 'dodatkowe strony raportu po wizycie',
    'patient-report-selected-pdf': 'wybrane strony raportu pacjenta',
    'patient-report-centile-chart': 'wykresy centylowe w raporcie',
    'patient-report-advanced-growth': 'sekcja zaawansowanego wzrastania w raporcie',
    'advanced-growth-pdf': 'raport zaawansowanego wzrastania PDF',
    'advanced-growth-bayley-pinneau': 'predykcja Bayley-Pinneau',
    'advanced-growth-rwt': 'predykcja Roche-Wainer-Thissen',
    'advanced-growth-reinehr': 'predykcja Reinehr/CDGP',
    'advanced-growth-gh-igf-import-bridge': 'mostek importu GH/IGF do historii advanced growth',
    'gh-therapy-indexeddb-resource-audit': 'audyt IndexedDB/BroadcastChannel/MutationObserver/fetch terapii GH/IGF i zasobów aplikacyjnych po cleanupach 8O-11',
    'fetch-timeout-cleanup': 'helpery fetch*WithTimeout z AbortController i klasyfikacją błędów',
    'service-worker-fetch-cache-strategy': 'audyt strategii fetch/cache/offline Service Workera bez zmiany semantyki cache',
    'service-worker-offline-update-flow-smoke': 'kontrolowany smoke E2E offline/update-flow Service Workera bez realnej rejestracji SW',
    'service-worker-versioned-shell-cache-key': 'spójny cache key zasobów shell z ?v= w precache i fetch Service Workera',
    'service-worker-stale-cache-pruning-audit': 'read-only audyt scope czyszczenia starych shell/runtime cache i ryzyka wzrostu runtime cache Service Workera',
    'service-worker-runtime-cache-pruning': 'TTL i max-entry pruning runtime cache Service Workera z metadanymi wpisów',
    'service-worker-client-lifecycle-audit': 'client-side lifecycle rejestracji/update-flow Service Workera',
    'service-worker-client-update-ux-smoke': 'client-side smoke UX banera aktualizacji Service Workera',
    'pwa-manifest-icon-cache-audit': 'audyt manifestu PWA, start_url/scope i cache ikon',
    'advanced-growth-calculation-adapters': 'adapter wejścia/wyjścia calculateGrowthAdvanced()',
    'advanced-growth-lifecycle-adapters': 'lifecycle commit/clear advancedGrowthData',
    'advanced-growth-calculation-orchestrator': 'orkiestrator calculateGrowthAdvanced() w VildaAdvancedGrowth',
    'advanced-growth-post-orchestrator-validation': 'walidacja po przeniesieniu calculateGrowthAdvanced()',
    'advanced-growth-intake-sync-audit': 'audyt i przygotowanie synchronizacji advanced growth ↔ estimated intake',
    'advanced-growth-intake-sync-helpers': 'neutralne helpery synchronizacji advanced growth ↔ estimated intake',
    'advanced-growth-intake-sync-row-operations': 'operacje kopiowania/backfill pojedynczego wiersza advanced growth ↔ estimated intake',
    'advanced-growth-intake-sync-pairing': 'parowanie list wierszy advanced growth ↔ estimated intake',
    'advanced-growth-intake-sync-handlers': 'handlery add/remove synchronizacji advanced growth ↔ estimated intake',
    'advanced-growth-intake-sync-live-wiring': 'event wiring input/change synchronizacji advanced growth ↔ estimated intake',
    'advanced-growth-intake-sync-final-validation': 'końcowa walidacja synchronizacji advanced growth ↔ estimated intake',
    'estimated-intake-card-audit': 'audyt karty estimated intake przed wydzieleniem',
    'estimated-intake-card-helpers': 'neutralne helpery karty estimated intake',
    'estimated-intake-alert-probe-audit': 'audyt funkcji alertowych estimated intake',
    'estimated-intake-calc-seam': 'seam diagnostyczny calcEstimatedIntake()',
    'estimated-intake-calculation-model': 'czysty model obliczeniowy estimated intake',
    'estimated-intake-ui': 'renderer wyników estimated intake',
    'estimated-intake-runtime': 'runtime efektów ubocznych estimated intake',
    'growth-reference-data': 'moduł statycznych danych referencyjnych BMI/LMS/WHO-WFL',
    'professional-module': 'moduł profesjonalny / walidacja PWZ wydzielona z app.js',
    'persist-runtime': 'runtime persistence/autosave/restore wydzielony z app.js',
    'summary-cards': 'karty podsumowań/metabolic summary UI wydzielone z app.js',
    'regression-smoke-suite': 'stały zestaw smoke testów regresyjnych',
    'numeric-validation-age-zero': 'jawna walidacja liczbowa age=0',
    'pediatric-bmi-no-adult-fallback': 'pediatryczna klasyfikacja BMI bez fallbacku do progów dorosłych',
    'nutrition-norms-refresh-queue': 'kolejka refreshy nutritionNormsModelUpdated dla food-summary',
    'update-hooks-registry': 'registry hooków po update() z obsługą bridge app.js',
    'update-hooks-first-wrapper-bridge': 'pierwszy wrapper window.update przepięty na VildaUpdateHooks',
    'update-hooks-second-wrapper-bridge': 'drugi wrapper app.js window.update przepięty na VildaUpdateHooks',
    'update-hooks-diet-recommendations-wrapper': 'wrapper zaleceń dietetycznych window.update przepięty na VildaUpdateHooks',
    'update-hooks-nutrition-norms-wrapper': 'wrapper nutrition_norms.js window.update przepięty na VildaUpdateHooks',
    'update-hooks-nutrition-micros-wrapper': 'wrapper nutrition_micros.js window.update przepięty na VildaUpdateHooks',
    'update-hooks-final-chain-audit': 'końcowy audyt łańcucha window.update po migracji znanych wrapperów',
    'growth-basic-module-chart': 'podstawowy wykres wzrastania',
    'circumference-module-pdf': 'PDF siatki obwodów',
    'zscore-batch-xlsx': 'wsadowy import/eksport Z-score XLSX',
    'clcr-pdf-export': 'PDF kalkulatora klirensu',
    'clcr-norms-xlsx': 'normy XLSX kalkulatora klirensu',
    'clcr-docx-export': 'DOCX kalkulatora klirensu',
    'diabetes-pdfmake-export': 'eksport PDF modułów cukrzycowych',
    'steroids-hpta-chart': 'wykres HPTA',
    'sga-birth-module-data': 'dane modułu SGA',
    'down-syndrome-lms-data': 'siatki LMS dla zespołu Downa',
    'down-syndrome-ui-module': 'moduł UI zespołu Downa',
    'anorexia-risk-module': 'moduł ryzyka anoreksji',
    'palczewska-centile-reference': 'referencja centylowa Palczewskiej'
  };

  const MODULE_FALLBACK_MESSAGES = {
    'main-bmi-metabolism-pdf': 'Nie można wygenerować raportu BMI/metabolizmu, bo brakuje wymaganej biblioteki PDF.',
    'diet-recommendations-pdf': 'Nie można wygenerować raportu zaleceń dietetycznych PDF, bo brakuje wymaganych bibliotek.',
    'patient-report-pdf': 'Nie można wygenerować raportu pacjenta PDF, bo brakuje wymaganych bibliotek.',
    'patient-report-visit-pages': 'Nie można dodać stron raportu po wizycie, bo brakuje wymaganych bibliotek.',
    'patient-report-selected-pdf': 'Nie można wygenerować wybranych stron raportu, bo brakuje wymaganej biblioteki PDF.',
    'patient-report-centile-chart': 'Nie można wygenerować wykresów centylowych, bo brakuje danych albo generatora wykresu.',
    'patient-report-advanced-growth': 'Nie można dodać sekcji zaawansowanego wzrastania, bo brakuje wymaganych funkcji.',
    'advanced-growth-pdf': 'Nie można wygenerować raportu wzrastania PDF, bo brakuje wymaganych bibliotek.',
    'advanced-growth-gh-igf-import-bridge': 'Nie można zsynchronizować punktów GH/IGF z historią advanced growth, bo brakuje wymaganych funkcji mostka.',
    'gh-therapy-indexeddb-resource-audit': 'Audyt zasobów GH/IGF IndexedDB/BroadcastChannel/MutationObserver/fetch po cleanupach 8O-11 nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'fetch-timeout-cleanup': 'Helpery fetch*WithTimeout z AbortController, clearTimeout i rozróżnieniem błędów nie są dostępne.',
    'service-worker-fetch-cache-strategy': 'Audyt strategii fetch/cache/offline Service Workera 8O-11e nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'service-worker-offline-update-flow-smoke': 'Smoke E2E offline/update-flow Service Workera 8O-11f nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'service-worker-versioned-shell-cache-key': 'Audyt/fix cache key dla wersjonowanych zasobów shell Service Workera 8O-11g nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'service-worker-stale-cache-pruning-audit': 'Audyt scope czyszczenia starych cache Service Workera 8O-11h nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'service-worker-runtime-cache-pruning': 'Runtime cache pruning Service Workera 8O-11i nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'service-worker-client-lifecycle-audit': 'Client-side lifecycle rejestracji/update-flow Service Workera 8O-11j nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'service-worker-client-update-ux-smoke': 'Smoke UX banera aktualizacji Service Workera 8O-11k nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'pwa-manifest-icon-cache-audit': 'Audyt manifestu PWA/start_url/scope/cache ikon 8O-11l nie jest dostępny albo nie udostępnia snapshotu read-only.',
    'advanced-growth-lifecycle-adapters': 'Nie można odświeżyć lifecycle advanced growth, bo brakuje wymaganych adapterów.',
    'advanced-growth-calculation-orchestrator': 'Nie można przeliczyć advanced growth, bo brakuje orkiestratora calculateGrowthAdvanced() w module.',
    'advanced-growth-post-orchestrator-validation': 'Walidacja advanced growth po przeniesieniu orkiestratora wykryła brak jednej z kluczowych funkcji.',
    'advanced-growth-intake-sync-audit': 'Audyt synchronizacji advanced growth ↔ estimated intake wykrył brak jednej z funkcji parowania lub diagnostyki.',
    'advanced-growth-intake-sync-helpers': 'Brakuje neutralnych helperów synchronizacji advanced growth ↔ estimated intake wydzielonych w VildaAdvancedGrowth.',
    'advanced-growth-intake-sync-row-operations': 'Brakuje operacji kopiowania/backfill pojedynczego wiersza advanced growth ↔ estimated intake wydzielonych w VildaAdvancedGrowth.',
    'advanced-growth-intake-sync-pairing': 'Brakuje modułowego parowania list wierszy advanced growth ↔ estimated intake wydzielonego w VildaAdvancedGrowth.',
    'advanced-growth-intake-sync-handlers': 'Brakuje modułowych handlerów add/remove synchronizacji advanced growth ↔ estimated intake wydzielonych w VildaAdvancedGrowth.',
    'advanced-growth-intake-sync-live-wiring': 'Brakuje modułowego event wiring input/change synchronizacji advanced growth ↔ estimated intake.',
    'advanced-growth-intake-sync-final-validation': 'Końcowa walidacja synchronizacji advanced growth ↔ estimated intake wykryła brak jednego z kluczowych aliasów lub modułów.',
    'estimated-intake-card-audit': 'Audyt karty estimated intake wykrył brak funkcji diagnostycznej albo kluczowych helperów.',
    'estimated-intake-card-helpers': 'Brakuje modułu neutralnych helperów estimated intake albo wrapperów app.js.',
    'estimated-intake-alert-probe-audit': 'Audyt funkcji alertowych estimated intake wykrył brak snapshotu albo wymaganych zależności.',
    'estimated-intake-calc-seam': 'Seam calcEstimatedIntake() wykrył brak diagnostyki albo kluczowych helperów wejścia/wyjścia.',
    'estimated-intake-calculation-model': 'Brakuje czystego modelu obliczeniowego estimated intake albo adapterów app.js.',
    'estimated-intake-ui': 'Brakuje modułu renderera wyników estimated intake albo adaptera renderowania w app.js.',
    'estimated-intake-runtime': 'Brakuje modułu runtime estimated intake albo adapterów commit/risk w app.js.',
    'growth-reference-data': 'Brakuje modułu statycznych danych referencyjnych BMI/LMS/WHO-WFL albo read-only snapshotu 8Q-1.',
    'professional-module': 'Brakuje modułu profesjonalnego VildaProfessionalModule albo mostek app.js nie widzi read-only snapshotu 8Q-2.',
    'persist-runtime': 'Brakuje modułu VildaPersistRuntime albo mostek app.js nie widzi read-only snapshotu 8Q-3.',
    'summary-cards': 'Brakuje modułu VildaSummaryCards albo mostek app.js nie widzi read-only snapshotu 8Q-4.',
    'diet-plan-ui': 'Brakuje modułu VildaDietPlanUI albo mostek app.js nie widzi read-only snapshotu 8Q-5.',
    'regression-smoke-suite': 'Stały zestaw smoke testów regresyjnych nie jest dostępny albo nie widzi wymaganych kontraktów.',
    'numeric-validation-age-zero': 'Walidacja liczbowa 8O-10a nie jest dostępna albo nadal odrzuca jawnie wpisany wiek 0 lat.',
    'pediatric-bmi-no-adult-fallback': 'Klasyfikacja BMI dzieci nadal może przechodzić na progi dorosłych przy braku percentyla albo brakuje snapshotu 8O-10b.',
    'nutrition-norms-refresh-queue': 'Kolejka refreshy nutritionNormsModelUpdated nie jest dostępna albo może gubić szybkie zdarzenia podczas trwającego odświeżania food-summary.',
    'update-hooks-registry': 'Registry hooków update nie jest dostępne albo nie zachowuje neutralności wobec window.update.',
    'update-hooks-first-wrapper-bridge': 'Bridge pierwszego przepiętego wrappera window.update nie jest dostępny albo hook BMI p50 nie został zarejestrowany.',
    'update-hooks-second-wrapper-bridge': 'Drugi wrapper app.js window.update nie został przepięty na VildaUpdateHooks albo hook idealnej wagi nie został zarejestrowany.',
    'update-hooks-diet-recommendations-wrapper': 'Wrapper zaleceń dietetycznych window.update nie został przepięty na VildaUpdateHooks albo hook widoczności zaleceń nie został zarejestrowany.',
    'update-hooks-nutrition-norms-wrapper': 'Wrapper nutrition_norms.js window.update nie został przepięty na VildaUpdateHooks albo hook renderowania norm nie został zarejestrowany.',
    'update-hooks-nutrition-micros-wrapper': 'Wrapper nutrition_micros.js window.update nie został przepięty na VildaUpdateHooks albo hook renderowania mikroelementów nie został zarejestrowany.',
    'update-hooks-final-chain-audit': 'Końcowy audyt łańcucha window.update nie jest dostępny albo nie potwierdza migracji znanych wrapperów 8O-10d.',
    'growth-basic-module-chart': 'Generator siatek centylowych nie jest gotowy.',
    'circumference-module-pdf': 'Nie można wygenerować PDF siatki obwodów, bo brakuje wymaganej biblioteki PDF.',
    'zscore-batch-xlsx': 'Nie można przetworzyć pliku XLSX, bo brakuje biblioteki SheetJS.',
    'clcr-pdf-export': 'Nie można wygenerować PDF kalkulatora klirensu, bo brakuje wymaganych bibliotek.',
    'clcr-norms-xlsx': 'Nie można odczytać norm XLSX kalkulatora klirensu, bo brakuje biblioteki SheetJS.',
    'clcr-docx-export': 'Nie można wygenerować DOCX kalkulatora klirensu, bo brakuje wymaganej biblioteki.',
    'diabetes-pdfmake-export': 'Nie można wygenerować PDF modułów cukrzycowych, bo brakuje biblioteki pdfMake.',
    'steroids-hpta-chart': 'Nie można narysować wykresu HPTA, bo brakuje Chart.js.',
    'sga-birth-module-data': 'Nie można obliczyć modułu SGA, bo brakuje danych referencyjnych.',
    'down-syndrome-lms-data': 'Nie można użyć siatek dla zespołu Downa, bo brakuje danych LMS.',
    'down-syndrome-ui-module': 'Nie można użyć modułu zespołu Downa, bo brakuje danych LMS albo modułu UI.',
    'anorexia-risk-module': 'Nie można zastosować korekty ryzyka anoreksji, bo moduł detekcji nie jest dostępny.'
  };


  function now() {
    try { return Date.now(); } catch (_) { return 0; }
  }

  function normalizePath(path) {
    return String(path || '').trim();
  }

  function normalizeModuleName(moduleName) {
    const text = String(moduleName || '').trim();
    return text || 'unknown-module';
  }

  function splitPath(path) {
    const normalized = normalizePath(path);
    if (!normalized) return [];
    return normalized.split('.').map(function (part) { return part.trim(); }).filter(Boolean);
  }

  function shouldLog(options) {
    const opts = options || {};
    if (opts.silent) return false;
    if (debugEnabled) return true;
    try {
      if (global.__VILDA_DEBUG === true) return true;
      if (global.localStorage && global.localStorage.getItem('vildaDebug') === '1') return true;
      return /(?:^|[?&])vildaDebug=1(?:&|$)/.test(global.location && global.location.search ? global.location.search : '');
    } catch (_) {
      return false;
    }
  }

  function logDependencyEvent(level, moduleName, message, error, meta, options) {
    const opts = options || {};
    if (opts.log === false || opts.silent === true) return null;
    try {
      const logger = global.VildaLogger || global.vildaLogger || null;
      if (!logger || typeof logger.log !== 'function') return null;
      return logger.log(level || 'warn', moduleName || 'vilda-deps', message || 'Zdarzenie zależności globalnych', error || null, Object.assign({
        helper: 'VildaDeps'
      }, meta || {}), { dedupeMs: opts.logDedupeMs || 4500 });
    } catch (_) {
      return null;
    }
  }

  function resolve(path, root) {
    const parts = splitPath(path);
    if (!parts.length) return undefined;
    let cursor = root || global;
    for (let i = 0; i < parts.length; i += 1) {
      if (cursor == null) return undefined;
      try {
        cursor = cursor[parts[i]];
      } catch (_) {
        return undefined;
      }
    }
    return cursor;
  }

  function inferType(value) {
    if (typeof value === 'undefined') return 'undefined';
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function typeMatches(value, expectedType) {
    if (!expectedType || expectedType === 'any') return typeof value !== 'undefined';
    if (expectedType === 'function') return typeof value === 'function';
    if (expectedType === 'object') return !!value && typeof value === 'object';
    if (expectedType === 'array') return Array.isArray(value);
    if (expectedType === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === expectedType;
  }

  function cloneEvent(event) {
    return Object.assign({}, event || {});
  }

  function shallowClone(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice();
    return Object.assign({}, value);
  }

  function normalizeStringList(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return normalizePath(item); }).filter(Boolean);
    }
    const single = normalizePath(value);
    return single ? [single] : [];
  }

  function trimEventList(list, max) {
    if (list.length > max) {
      list.splice(0, list.length - max);
    }
  }

  function recordMissing(path, options, actualType) {
    const opts = options || {};
    const name = normalizePath(path);
    const moduleName = normalizeModuleName(opts.moduleName || opts.module || opts.context);
    const expectedType = opts.type || 'any';
    const key = moduleName + '::' + name + '::' + expectedType;
    const event = {
      kind: opts.kind || 'dependency-missing',
      name,
      moduleName,
      expectedType,
      actualType: actualType || 'undefined',
      required: opts.required !== false,
      critical: opts.critical !== false,
      contract: opts.contract === true,
      message: opts.message || ('Brak wymaganej zależności globalnej: ' + name),
      timestamp: now()
    };

    if (opts.description) event.description = opts.description;
    if (opts.source) event.source = opts.source;
    if (opts.page) event.page = opts.page;

    missingEvents.push(event);
    trimEventList(missingEvents, MAX_EVENTS);

    if (!warned[key]) {
      warned[key] = true;
      logDependencyEvent(event.critical ? 'error' : 'warn', moduleName, event.message, null, {
        dependency: name,
        expectedType,
        actualType: event.actualType,
        required: event.required,
        critical: event.critical,
        source: event.source || '',
        page: event.page || ''
      }, opts);
      try {
        if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
          global.dispatchEvent(new CustomEvent('vilda:dependency-missing', { detail: cloneEvent(event) }));
        }
      } catch (_) {
    void _;
  }

      if (shouldLog(opts) && global.console && typeof global.console.warn === 'function') {
        try {
          global.console.warn('[VildaDeps] ' + event.message + ' [' + moduleName + ']', {
            name,
            expectedType,
            actualType: event.actualType,
            required: event.required,
            source: event.source || null
          });
        } catch (_) {
    void _;
  }
      }
    }

    return event;
  }

  function requireDependency(path, options) {
    const opts = options || {};
    const name = normalizePath(path);
    const expectedType = opts.type || 'any';
    const value = resolve(name, opts.root || global);

    if (typeMatches(value, expectedType)) return value;

    recordMissing(name, Object.assign({}, opts, { type: expectedType }), inferType(value));

    if (typeof opts.onMissing === 'function') {
      try { opts.onMissing(name, opts); } catch (_) {
    void _;
  }
    }
    return Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
  }

  function requireFunction(path, options) {
    return requireDependency(path, Object.assign({}, options || {}, { type: 'function' }));
  }

  function requireObject(path, options) {
    return requireDependency(path, Object.assign({}, options || {}, { type: 'object' }));
  }

  function requireAny(paths, options) {
    const list = Array.isArray(paths) ? paths : [paths];
    const opts = options || {};
    for (let i = 0; i < list.length; i += 1) {
      const name = normalizePath(list[i]);
      const value = resolve(name, opts.root || global);
      if (typeMatches(value, opts.type || 'any')) return value;
    }
    recordMissing(list.map(normalizePath).filter(Boolean).join(' | '), opts, 'undefined');
    return Object.prototype.hasOwnProperty.call(opts, 'fallback') ? opts.fallback : null;
  }

  function has(path, expectedType) {
    return typeMatches(resolve(path), expectedType || 'any');
  }

  function isFunction(path) {
    return has(path, 'function');
  }

  function isObject(path) {
    return has(path, 'object');
  }

  function warnMissing(path, moduleName, details) {
    return recordMissing(path, Object.assign({}, details || {}, { moduleName: moduleName || (details && details.moduleName) }), details && details.actualType);
  }

  function normalizeDependencySpec(spec, defaults) {
    const base = defaults || {};
    if (typeof spec === 'string') {
      return {
        name: spec,
        path: spec,
        type: base.type || 'any',
        required: base.required !== false,
        critical: base.critical !== false,
        source: base.source || '',
        script: base.script || '',
        description: base.description || ''
      };
    }
    const obj = spec && typeof spec === 'object' ? spec : {};
    const path = normalizePath(obj.path || obj.name);
    return {
      name: normalizePath(obj.name || path),
      path,
      type: obj.type || base.type || 'any',
      required: obj.required !== false && base.required !== false,
      critical: obj.critical !== false && base.critical !== false,
      source: obj.source || base.source || '',
      script: obj.script || base.script || '',
      description: obj.description || base.description || '',
      group: obj.group || base.group || ''
    };
  }

  function cloneDependency(dep) {
    return shallowClone(dep);
  }

  function cloneContract(contract) {
    if (!contract) return null;
    return {
      moduleName: contract.moduleName,
      description: contract.description,
      critical: contract.critical !== false,
      pages: contract.pages.slice(),
      tags: contract.tags.slice(),
      script: contract.script || '',
      loadAfter: contract.loadAfter.slice(),
      dependencies: contract.dependencies.map(cloneDependency),
      definedAt: contract.definedAt
    };
  }

  function defineModuleDeps(moduleName, dependencies, options) {
    const name = normalizeModuleName(moduleName);
    const opts = options || {};
    const list = Array.isArray(dependencies) ? dependencies : [];
    const normalized = list.map(function (dep) { return normalizeDependencySpec(dep, opts.defaults); }).filter(function (dep) { return !!dep.path; });
    const previous = moduleContracts[name];
    const shouldMerge = opts.merge === true && previous;
    const contract = {
      moduleName: name,
      description: opts.description || (previous && previous.description) || '',
      critical: opts.critical !== false,
      pages: normalizeStringList(opts.pages || opts.page || (previous && previous.pages)),
      tags: normalizeStringList(opts.tags || opts.tag || (previous && previous.tags)),
      script: normalizePath(opts.script || (previous && previous.script)),
      loadAfter: normalizeStringList(opts.loadAfter || opts.afterScripts || (previous && previous.loadAfter)),
      dependencies: shouldMerge ? previous.dependencies.concat(normalized) : normalized,
      definedAt: now()
    };
    moduleContracts[name] = contract;
    return cloneContract(contract);
  }

  function defineModuleDependencies(moduleName, dependencies, options) {
    return defineModuleDeps(moduleName, dependencies, options);
  }

  function defineLoadOrderRule(name, source, target, options) {
    const opts = options || {};
    const rule = {
      name: normalizePath(name) || (normalizePath(source) + '-before-' + normalizePath(target)),
      source: normalizePath(source || opts.source),
      target: normalizePath(target || opts.target),
      required: opts.required !== false,
      critical: opts.critical !== false,
      description: opts.description || '',
      pages: normalizeStringList(opts.pages || opts.page),
      definedAt: now()
    };
    if (!rule.source || !rule.target) return null;
    const existingIndex = loadOrderRules.findIndex(function (item) { return item.name === rule.name; });
    if (existingIndex >= 0) {
      loadOrderRules[existingIndex] = rule;
    } else {
      loadOrderRules.push(rule);
    }
    return shallowClone(rule);
  }

  function getLoadOrderRules() {
    return loadOrderRules.map(shallowClone);
  }

  function listModuleDeps() {
    return listModules().map(function (name) { return getModuleDeps(name); });
  }

  function getModuleDeps(moduleName) {
    const contract = moduleContracts[normalizeModuleName(moduleName)];
    return cloneContract(contract);
  }

  function listModules() {
    return Object.keys(moduleContracts).sort();
  }

  function getModuleContracts() {
    const out = {};
    listModules().forEach(function (name) {
      out[name] = cloneContract(moduleContracts[name]);
    });
    return out;
  }

  function currentPageKey() {
    try {
      const pathname = (global.location && global.location.pathname) ? global.location.pathname : '';
      if (!pathname || pathname === '/') return 'index.html';
      const trimmed = pathname.replace(/\/+$|^\/+/, '');
      const parts = trimmed.split('/').filter(Boolean);
      return parts.length ? parts[parts.length - 1] : 'index.html';
    } catch (_) {
      return 'index.html';
    }
  }

  function normalizePageName(page) {
    const text = normalizePath(page);
    if (!text || text === '/') return 'index.html';
    const trimmed = text.replace(/\/+$|^\/+/, '');
    const parts = trimmed.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : text;
  }

  function contractAppliesToPage(contract, page) {
    if (!contract) return false;
    const pages = contract.pages || [];
    if (!pages.length) return true;
    const pageKey = normalizePageName(page || currentPageKey());
    return pages.some(function (entry) {
      const normalized = normalizePageName(entry);
      return normalized === '*' || normalized === 'all' || normalized === pageKey;
    });
  }

  function checkOneDependency(dep, moduleName, options) {
    const opts = options || {};
    const value = resolve(dep.path, opts.root || global);
    const ok = typeMatches(value, dep.type || 'any');
    const required = dep.required !== false;
    const result = {
      name: dep.name || dep.path,
      path: dep.path,
      type: dep.type || 'any',
      actualType: inferType(value),
      ok,
      required,
      critical: dep.critical !== false,
      source: dep.source || '',
      script: dep.script || '',
      description: dep.description || ''
    };

    if (!ok && (opts.record !== false)) {
      recordMissing(dep.path, {
        moduleName,
        type: dep.type || 'any',
        required,
        critical: dep.critical !== false,
        contract: true,
        silent: opts.silent === true,
        source: dep.source,
        description: dep.description,
        page: opts.page || currentPageKey(),
        message: (required ? 'Brak wymaganej zależności modułu' : 'Brak opcjonalnej zależności modułu') + ': ' + dep.path
      }, result.actualType);
    }

    return result;
  }

  function summarizeDependencyResults(results) {
    const missingRequired = results.filter(function (item) { return !item.ok && item.required; });
    const missingOptional = results.filter(function (item) { return !item.ok && !item.required; });
    return {
      ok: missingRequired.length === 0,
      missingRequired,
      missingOptional,
      available: results.filter(function (item) { return item.ok; })
    };
  }

  function recordContractCheck(result) {
    contractCheckEvents.push({
      kind: 'module-deps-check',
      moduleName: result.moduleName,
      ok: result.ok,
      missingRequiredCount: result.missingRequired.length,
      missingOptionalCount: result.missingOptional.length,
      page: result.page,
      timestamp: result.timestamp
    });
    trimEventList(contractCheckEvents, MAX_CHECKS);
  }

  function checkModuleDeps(moduleName, options) {
    const name = normalizeModuleName(moduleName);
    const contract = moduleContracts[name];
    const opts = options || {};
    const timestamp = now();
    if (!contract) {
      const resultMissingContract = {
        moduleName: name,
        ok: false,
        page: opts.page || currentPageKey(),
        timestamp,
        contractFound: false,
        dependencies: [],
        missingRequired: [],
        missingOptional: [],
        message: 'Brak kontraktu zależności dla modułu: ' + name
      };
      if (opts.record !== false) {
        recordMissing(name, {
          moduleName: 'vilda-deps-contracts',
          type: 'contract',
          required: true,
          contract: true,
          silent: opts.silent === true,
          message: resultMissingContract.message,
          page: opts.page || currentPageKey()
        }, 'undefined');
      }
      return resultMissingContract;
    }

    const dependencies = contract.dependencies.map(function (dep) {
      return checkOneDependency(dep, name, opts);
    });
    const summary = summarizeDependencyResults(dependencies);
    const result = {
      moduleName: name,
      ok: summary.ok,
      page: opts.page || currentPageKey(),
      timestamp,
      contractFound: true,
      description: contract.description,
      critical: contract.critical !== false,
      dependencies,
      missingRequired: summary.missingRequired,
      missingOptional: summary.missingOptional,
      available: summary.available
    };
    if (opts.store !== false) recordContractCheck(result);
    return result;
  }

  function collectContractsForCheck(options) {
    const opts = options || {};
    const page = opts.page || currentPageKey();
    let names = [];
    if (Array.isArray(opts.modules) && opts.modules.length) {
      names = opts.modules.map(normalizeModuleName);
    } else {
      names = listModules().filter(function (name) {
        const contract = moduleContracts[name];
        if (!contract) return false;
        if (opts.criticalOnly !== false && contract.critical === false) return false;
        if (opts.scope === 'all') return true;
        return contractAppliesToPage(contract, page);
      });
    }
    return names;
  }

  function checkCriticalDependencies(options) {
    const opts = options || {};
    const page = opts.page || currentPageKey();
    const moduleNames = collectContractsForCheck(Object.assign({}, opts, { page }));
    const modules = moduleNames.map(function (name) {
      return checkModuleDeps(name, Object.assign({}, opts, { page }));
    });
    const missingRequired = [];
    const missingOptional = [];
    modules.forEach(function (mod) {
      (mod.missingRequired || []).forEach(function (dep) {
        missingRequired.push(Object.assign({ moduleName: mod.moduleName }, dep));
      });
      (mod.missingOptional || []).forEach(function (dep) {
        missingOptional.push(Object.assign({ moduleName: mod.moduleName }, dep));
      });
    });
    return {
      version: VERSION,
      ok: missingRequired.length === 0,
      page,
      scope: opts.scope === 'all' ? 'all' : 'current-page',
      moduleCount: modules.length,
      modules,
      missingRequired,
      missingOptional,
      timestamp: now()
    };
  }

  function getScriptInventory() {
    const doc = global.document;
    if (!doc || typeof doc.getElementsByTagName !== 'function') return [];
    let scripts = [];
    try {
      scripts = Array.prototype.slice.call(doc.getElementsByTagName('script') || []);
    } catch (_) {
      scripts = [];
    }
    return scripts.map(function (script, index) {
      const rawSrc = script && script.getAttribute ? (script.getAttribute('src') || '') : (script && script.src ? script.src : '');
      let pathname = '';
      let file = '';
      try {
        const url = rawSrc ? new URL(rawSrc, global.location && global.location.href ? global.location.href : 'https://local.invalid/') : null;
        pathname = url ? url.pathname : '';
        file = pathname.split('/').filter(Boolean).pop() || '';
      } catch (_) {
        pathname = rawSrc || '';
        file = String(pathname || '').split('/').filter(Boolean).pop() || '';
      }
      return {
        index,
        src: rawSrc,
        pathname,
        file,
        async: !!(script && script.async),
        defer: !!(script && script.defer),
        type: script && script.type ? script.type : '',
        inline: !rawSrc
      };
    });
  }

  function scriptMatches(script, token) {
    const needle = normalizePath(token);
    if (!needle || !script) return false;
    return String(script.src || '').indexOf(needle) !== -1 ||
      String(script.pathname || '').indexOf(needle) !== -1 ||
      String(script.file || '').indexOf(needle) !== -1;
  }

  function findScriptIndex(token, inventory) {
    const scripts = inventory || getScriptInventory();
    for (let i = 0; i < scripts.length; i += 1) {
      if (scriptMatches(scripts[i], token)) return scripts[i].index;
    }
    return -1;
  }

  function ruleAppliesToPage(rule, page) {
    if (!rule || !rule.pages || !rule.pages.length) return true;
    const pageKey = normalizePageName(page || currentPageKey());
    return rule.pages.some(function (entry) {
      const normalized = normalizePageName(entry);
      return normalized === '*' || normalized === 'all' || normalized === pageKey;
    });
  }

  function checkLoadOrderRule(rule, inventory, page) {
    const sourceIndex = findScriptIndex(rule.source, inventory);
    const targetIndex = findScriptIndex(rule.target, inventory);
    const required = rule.required !== false;
    let ok = true;
    let reason = 'order-ok';

    if (sourceIndex < 0 || targetIndex < 0) {
      ok = !required;
      reason = sourceIndex < 0 && targetIndex < 0 ? 'source-and-target-not-found' :
        (sourceIndex < 0 ? 'source-not-found' : 'target-not-found');
    } else if (sourceIndex > targetIndex) {
      ok = false;
      reason = 'source-after-target';
    }

    return {
      kind: 'load-order-rule',
      ruleName: rule.name,
      ok,
      reason,
      sourceScript: rule.source,
      targetScript: rule.target,
      sourceIndex,
      targetIndex,
      required,
      critical: rule.critical !== false,
      description: rule.description || '',
      page: page || currentPageKey()
    };
  }

  function checkScriptOrder(options) {
    const opts = options || {};
    const page = opts.page || currentPageKey();
    const inventory = getScriptInventory();
    const moduleNames = collectContractsForCheck(Object.assign({}, opts, { page }));
    const checks = [];

    loadOrderRules.forEach(function (rule) {
      if (ruleAppliesToPage(rule, page)) {
        checks.push(checkLoadOrderRule(rule, inventory, page));
      }
    });
    moduleNames.forEach(function (name) {
      const contract = moduleContracts[name];
      if (!contract || !contract.script) return;
      const moduleIndex = findScriptIndex(contract.script, inventory);
      if (moduleIndex < 0) {
        checks.push({ moduleName: name, ok: false, reason: 'module-script-not-found', moduleScript: contract.script, moduleIndex });
        return;
      }
      const tokens = [];
      (contract.loadAfter || []).forEach(function (token) { if (token) tokens.push(token); });
      (contract.dependencies || []).forEach(function (dep) { if (dep.script) tokens.push(dep.script); });
      const uniqueTokens = Array.from(new Set(tokens));
      uniqueTokens.forEach(function (token) {
        const depIndex = findScriptIndex(token, inventory);
        if (depIndex < 0) {
          checks.push({ moduleName: name, ok: true, reason: 'dependency-script-not-found-global-may-be-inline', moduleScript: contract.script, dependencyScript: token, moduleIndex, dependencyIndex: depIndex });
          return;
        }
        checks.push({
          moduleName: name,
          ok: depIndex <= moduleIndex,
          reason: depIndex <= moduleIndex ? 'order-ok' : 'dependency-after-module',
          moduleScript: contract.script,
          dependencyScript: token,
          moduleIndex,
          dependencyIndex: depIndex
        });
      });
    });
    const violations = checks.filter(function (item) { return !item.ok; });
    return {
      version: VERSION,
      ok: violations.length === 0,
      page,
      scriptCount: inventory.length,
      checks,
      violations,
      timestamp: now()
    };
  }

  function moduleDepsReady(moduleName, options) {
    return !!checkModuleDeps(moduleName, Object.assign({ record: false, silent: true }, options || {})).ok;
  }

  function getDependencyStatus(options) {
    const opts = options || {};
    const page = opts.page || currentPageKey();
    const critical = checkCriticalDependencies(Object.assign({}, opts, { page }));
    const scriptOrder = checkScriptOrder(Object.assign({}, opts, { page }));
    return {
      version: VERSION,
      ok: critical.ok && scriptOrder.ok,
      page,
      critical,
      scriptOrder,
      missing: getMissing(),
      contractChecks: getContractChecks(),
      moduleCount: listModules().length,
      loadOrderRuleCount: loadOrderRules.length,
      timestamp: now()
    };
  }

  function dumpContracts() {
    const contracts = getModuleContracts();
    try {
      if (global.console && typeof global.console.table === 'function') {
        global.console.table(listModules().map(function (name) {
          const contract = moduleContracts[name];
          return {
            moduleName: name,
            critical: contract.critical !== false,
            pages: contract.pages.join(', '),
            deps: contract.dependencies.length,
            script: contract.script || ''
          };
        }));
      }
    } catch (_) {
    void _;
  }
    return contracts;
  }

  function dumpCriticalDependencies(options) {
    const result = checkCriticalDependencies(options || {});
    try {
      if (global.console && typeof global.console.table === 'function') {
        global.console.table(result.modules.map(function (mod) {
          return {
            moduleName: mod.moduleName,
            ok: mod.ok,
            missingRequired: mod.missingRequired.length,
            missingOptional: mod.missingOptional.length,
            deps: mod.dependencies.length
          };
        }));
      }
    } catch (_) {
    void _;
  }
    return result;
  }

  function getDiagnostics() {
    return {
      version: VERSION,
      missing: missingEvents.map(cloneEvent),
      checks: contractCheckEvents.map(cloneEvent),
      notices: noticeEvents.map(cloneEvent),
      warnedKeys: Object.keys(warned),
      contracts: getModuleContracts(),
      debug: !!debugEnabled
    };
  }

  function getMissing() {
    return missingEvents.map(cloneEvent);
  }

  function getContractChecks() {
    return contractCheckEvents.map(cloneEvent);
  }

  function resetDiagnostics() {
    missingEvents.splice(0, missingEvents.length);
    contractCheckEvents.splice(0, contractCheckEvents.length);
    noticeEvents.splice(0, noticeEvents.length);
    Object.keys(lastNoticeByKey).forEach(function (key) { delete lastNoticeByKey[key]; });
    Object.keys(warned).forEach(function (key) { delete warned[key]; });
  }

  function setDebug(value) {
    debugEnabled = value !== false;
  }


  function uniqueStrings(values) {
    const seen = Object.create(null);
    const out = [];
    (values || []).forEach(function (value) {
      const text = String(value || '').trim();
      if (!text || seen[text]) return;
      seen[text] = true;
      out.push(text);
    });
    return out;
  }

  function friendlyDependencyName(dep) {
    const path = normalizePath((dep && (dep.path || dep.name)) || dep);
    if (!path) return '';
    if (DEPENDENCY_LABELS[path]) return DEPENDENCY_LABELS[path];
    const source = normalizePath(dep && dep.source);
    if (source) return source;
    return path;
  }

  function friendlyModuleName(moduleName) {
    const name = normalizeModuleName(moduleName);
    return MODULE_LABELS[name] || name;
  }

  function resolveStatusElement(target) {
    if (!target || !global.document) return null;
    if (target.nodeType === 1) return target;
    if (typeof target !== 'string') return null;
    const key = target.trim();
    if (!key) return null;
    try {
      return global.document.getElementById(key) || global.document.querySelector(key);
    } catch (_) {
      return null;
    }
  }

  function setStatusElementMessage(target, message, options) {
    const el = resolveStatusElement(target);
    if (!el) return false;
    try {
      el.textContent = String(message || '');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      if (options && options.statusClass) el.classList.add(options.statusClass);
      if (options && options.statusColor) {
        el.style.color = options.statusColor;
      } else {
        try {
          const root = global.document && global.document.documentElement;
          const computed = global.getComputedStyle ? global.getComputedStyle(root) : null;
          el.style.color = (computed && computed.getPropertyValue('--danger')) || '#d32f2f';
        } catch (_) {
          el.style.color = '#d32f2f';
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function ensureNoticeStyles() {
    const doc = global.document;
    if (!doc || !doc.head || doc.getElementById('vilda-dependency-notice-style')) return;
    try {
      const style = doc.createElement('style');
      style.id = 'vilda-dependency-notice-style';
      style.textContent = [
        '#vilda-dependency-notice-container{position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;flex-direction:column;gap:10px;max-width:min(420px,calc(100vw - 32px));pointer-events:none}',
        '.vilda-dependency-notice{box-sizing:border-box;border:1px solid rgba(211,47,47,.28);border-left:4px solid #d32f2f;border-radius:14px;background:rgba(255,255,255,.96);box-shadow:0 18px 45px rgba(0,0,0,.16);color:#2f3137;padding:12px 38px 12px 14px;font:500 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto;position:relative}',
        '.vilda-dependency-notice strong{display:block;margin:0 0 3px;font-size:14px;color:#b42318}',
        '.vilda-dependency-notice small{display:block;margin-top:6px;color:#69707a;font-weight:400}',
        '.vilda-dependency-notice button{position:absolute;right:8px;top:8px;border:0;background:transparent;color:#6b7280;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px}'
      ].join('\n');
      doc.head.appendChild(style);
    } catch (_) {
    void _;
  }
  }

  function getNoticeContainer() {
    const doc = global.document;
    if (!doc || !doc.body) return null;
    ensureNoticeStyles();
    let container = null;
    try { container = doc.getElementById('vilda-dependency-notice-container'); } catch (_) { container = null; }
    if (container) return container;
    try {
      container = doc.createElement('div');
      container.id = 'vilda-dependency-notice-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'false');
      doc.body.appendChild(container);
      return container;
    } catch (_) {
      return null;
    }
  }

  function showInjectedNotice(message, options) {
    const opts = options || {};
    const container = getNoticeContainer();
    if (!container) return false;
    try {
      const doc = global.document;
      const notice = doc.createElement('div');
      notice.className = 'vilda-dependency-notice';
      notice.setAttribute('role', 'status');
      const title = doc.createElement('strong');
      title.textContent = opts.title || 'Brakuje wymaganych zasobów';
      const body = doc.createElement('div');
      body.textContent = String(message || '');
      const hint = doc.createElement('small');
      hint.textContent = opts.hint || 'Odśwież stronę. Jeżeli problem wróci, wyczyść cache lub sprawdź kolejność ładowania skryptów.';
      const close = doc.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Zamknij komunikat');
      close.textContent = '×';
      close.addEventListener('click', function () {
        try { notice.remove(); } catch (_) {
    void _;
  }
      });
      notice.appendChild(close);
      notice.appendChild(title);
      notice.appendChild(body);
      if (opts.showHint !== false) notice.appendChild(hint);
      container.appendChild(notice);
      const timeout = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 9000;
      if (timeout > 0) {
        global.setTimeout(function () {
          try { notice.remove(); } catch (_) {
    void _;
  }
        }, timeout);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function buildMissingDependencyMessage(resultOrModule, options) {
    const opts = options || {};
    const result = coerceDependencyResult(resultOrModule, Object.assign({}, opts, { record: opts.record !== false, silent: true }));
    const moduleName = normalizeModuleName((result && result.moduleName) || (typeof resultOrModule === 'string' ? resultOrModule : 'unknown-module'));
    const missingRequired = (result && result.missingRequired) ? result.missingRequired : [];
    const missingOptional = (result && result.missingOptional) ? result.missingOptional : [];
    const missing = uniqueStrings(missingRequired.map(friendlyDependencyName).concat(opts.includeOptional ? missingOptional.map(friendlyDependencyName) : []));
    const base = opts.message || MODULE_FALLBACK_MESSAGES[moduleName] || ('Nie można uruchomić funkcji „' + friendlyModuleName(moduleName) + '”, bo brakuje wymaganych bibliotek lub danych.');
    const missingText = missing.length ? ' Brakujące elementy: ' + missing.join(', ') + '.' : '';
    const recovery = opts.recovery || ' Odśwież stronę i spróbuj ponownie. Jeśli problem wraca, wyczyść cache albo sprawdź kolejność ładowania skryptów.';
    return String(base + missingText + recovery).replace(/\s+/g, ' ').trim();
  }

  function coerceDependencyResult(resultOrModule, options) {
    const opts = options || {};
    if (typeof resultOrModule === 'string') {
      return checkModuleDeps(resultOrModule, Object.assign({ silent: true }, opts));
    }
    if (resultOrModule && typeof resultOrModule === 'object') return resultOrModule;
    return {
      moduleName: normalizeModuleName(opts.moduleName),
      ok: true,
      missingRequired: [],
      missingOptional: [],
      contractFound: false
    };
  }

  function recordNotice(event) {
    noticeEvents.push(cloneEvent(event));
    trimEventList(noticeEvents, MAX_NOTICES);
  }

  function showDependencyNotice(message, options) {
    const opts = options || {};
    const text = String(message || '').trim();
    if (!text || opts.show === false || opts.showUi === false) return false;
    const moduleName = normalizeModuleName(opts.moduleName || opts.module || opts.context);
    const key = moduleName + '::' + text;
    const ts = now();
    const dedupeMs = Number.isFinite(opts.dedupeMs) ? opts.dedupeMs : 4500;
    if (dedupeMs > 0 && lastNoticeByKey[key] && (ts - lastNoticeByKey[key]) < dedupeMs) {
      return true;
    }
    lastNoticeByKey[key] = ts;

    const event = {
      kind: 'dependency-notice',
      moduleName,
      message: text,
      timestamp: ts,
      level: opts.level || 'error'
    };
    recordNotice(event);
    logDependencyEvent(event.level === 'error' ? 'error' : 'warn', moduleName, text, null, {
      notice: true,
      statusOnly: opts.statusOnly === true,
      statusElement: opts.statusElement || ''
    }, opts);

    try {
      if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('vilda:dependency-notice', { detail: cloneEvent(event) }));
      }
    } catch (_) {
    void _;
  }

    const statusWritten = opts.statusElement ? setStatusElementMessage(opts.statusElement, text, opts) : false;
    if (opts.statusOnly === true) return statusWritten;

    if (opts.preferToast !== false) {
      try {
        if (typeof global.patientReportShowToast === 'function') {
          global.patientReportShowToast(text);
          return true;
        }
      } catch (_) {
    void _;
  }
    }
    return showInjectedNotice(text, opts) || statusWritten;
  }

  function notifyMissingDependencies(resultOrModule, options) {
    const opts = options || {};
    const result = coerceDependencyResult(resultOrModule, Object.assign({}, opts, { silent: true }));
    if (!result || result.ok !== false) return Object.assign({ userMessage: '' }, result || {});
    const message = buildMissingDependencyMessage(result, opts);
    showDependencyNotice(message, Object.assign({}, opts, { moduleName: result.moduleName }));
    return Object.assign({}, result, { userMessage: message });
  }

  function createMissingDependenciesError(resultOrModule, options) {
    const notified = notifyMissingDependencies(resultOrModule, options || {});
    const message = notified.userMessage || buildMissingDependencyMessage(notified, options || {});
    const error = new Error(message);
    error.name = 'VildaDependencyError';
    error.vildaDependencyError = true;
    error.vildaDependencyResult = notified;
    return error;
  }

  function getNotices() {
    return noticeEvents.map(cloneEvent);
  }

  function registerDefaultContracts() {
    const JS_PDF = { path: 'jspdf.jsPDF', type: 'function', source: 'jsPDF UMD', script: 'jspdf.umd.min.js' };
    const HTML2CANVAS = { path: 'html2canvas', type: 'function', source: 'html2canvas', script: 'html2canvas.min.js' };
    const XLSX = { path: 'XLSX', type: 'object', source: 'SheetJS XLSX', script: 'xlsx.full.min.js' };
    const DOCX = { path: 'docx', type: 'object', source: 'docx.js', script: 'docx' };
    const DOCX_PACKER = { path: 'docx.Packer', type: 'any', source: 'docx.js', script: 'docx', required: false };
    const PDFMAKE = { path: 'pdfMake', type: 'object', source: 'pdfmake', script: 'pdfmake.min.js' };
    const PDFMAKE_CREATE = { path: 'pdfMake.createPdf', type: 'function', source: 'pdfmake', script: 'pdfmake.min.js' };
    const PDFMAKE_VFS = { path: 'pdfMake.vfs', type: 'object', source: 'pdfmake fonts', script: 'vfs_fonts.min.js', required: false };
    const CHART = { path: 'Chart', type: 'function', source: 'Chart.js', script: 'chart.js' };
    const CENTILE_DATA = { path: 'centileData', type: 'object', source: 'centile_data.js', script: 'centile_data.js' };
    const GENERATE_CENTILE = { path: 'generateCentileChart', type: 'function', source: 'inline centile chart renderer' };
    const GENERATE_PAL = { path: 'generatePalczewskaCentileCharts', type: 'function', source: 'inline Palczewska chart renderer' };
    const GET_CHART_STATE = { path: 'getCentileChartState', type: 'function', source: 'inline centile chart state' };
    const BUILD_CENTILE_CANVAS = { path: 'buildCentilePageCanvas', type: 'function', source: 'inline centile page canvas builder' };
    const EFFECTIVE_CENTILE_STATE = { path: 'getEffectiveCentileGrowthDataState', type: 'function', source: 'inline centile growth data state', required: false };
    const COLLECT_AGES = { path: 'collectAllAgesMonths', type: 'function', source: 'inline centile age collector' };

    defineLoadOrderRule('vilda-deps-before-app', 'vilda_deps.js', 'app.js', {
      description: 'Helper VildaDeps powinien być dostępny przed app.js'
    });
    defineLoadOrderRule('ds-lms-before-down-syndrome-module', 'ds_lms.js', 'vilda_down_syndrome.js', {
      description: 'Dane LMS zespołu Downa powinny ładować się przed modułem UI Down Syndrome',
      pages: ['index.html', 'docpro.html']
    });
    defineLoadOrderRule('down-syndrome-module-before-app', 'vilda_down_syndrome.js', 'app.js', {
      description: 'Moduł Down Syndrome powinien być dostępny przed app.js, aby zachować dawne globalne funkcje __ds_*',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('anorexia-risk-before-app', 'vilda_anorexia_risk.js', 'app.js', {
      description: 'Moduł ryzyka anoreksji powinien być dostępny przed app.js dla energyMaybeApplyRiskAdjustment()',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('vilda-food-data-before-macro-practice', 'vilda_food_data.js', 'vilda_macro_practice.js', {
      description: 'Statyczne dane produktów powinny ładować się przed helperem makro-praktyki'
    });
    defineLoadOrderRule('vilda-macro-practice-before-food-summary', 'vilda_macro_practice.js', 'vilda_food_summary.js', {
      description: 'Helper makro-praktyki powinien być dostępny przed podsumowaniem posiłków'
    });
    defineLoadOrderRule('vilda-macro-practice-before-update-prep', 'vilda_macro_practice.js', 'vilda_update_prep.js', {
      description: 'Globalne funkcje makro-praktyki powinny być dostępne przed orkiestratorem update()'
    });
    defineLoadOrderRule('vilda-macro-practice-before-app', 'vilda_macro_practice.js', 'app.js', {
      description: 'Globalne funkcje makro-praktyki powinny być dostępne przed app.js'
    });
    defineLoadOrderRule('vilda-food-data-before-activity-burn', 'vilda_food_data.js', 'vilda_activity_burn.js', {
      description: 'Statyczne dane aktywności powinny ładować się przed helperem spalania aktywności'
    });
    defineLoadOrderRule('vilda-food-data-before-food-summary', 'vilda_food_data.js', 'vilda_food_summary.js', {
      description: 'Statyczne dane posiłków powinny ładować się przed helperem podsumowania posiłków'
    });
    defineLoadOrderRule('vilda-activity-burn-before-food-summary', 'vilda_activity_burn.js', 'vilda_food_summary.js', {
      description: 'Helper spalania aktywności powinien być dostępny przed podsumowaniem posiłków'
    });
    defineLoadOrderRule('vilda-activity-burn-before-app', 'vilda_activity_burn.js', 'app.js', {
      description: 'Helper spalania aktywności powinien być dostępny przed app.js'
    });
    defineLoadOrderRule('vilda-food-summary-before-update-prep', 'vilda_food_summary.js', 'vilda_update_prep.js', {
      description: 'Helper podsumowania posiłków powinien być dostępny przed orkiestratorem update()'
    });
    defineLoadOrderRule('vilda-food-summary-before-app', 'vilda_food_summary.js', 'app.js', {
      description: 'Helper podsumowania posiłków powinien być dostępny przed app.js'
    });
    defineLoadOrderRule('vilda-food-summary-before-smoke-tests', 'vilda_food_summary.js', 'vilda_smoke_tests.js', {
      description: 'Smoke suite 8O-10c sprawdza read-only snapshot kolejki refreshy food-summary, więc moduł food-summary powinien być załadowany wcześniej'
    });
    defineLoadOrderRule('vilda-data-import-export-before-update-prep', 'vilda_data_import_export.js', 'vilda_update_prep.js', {
      description: 'Neutralne helpery importu/eksportu powinny być dostępne przed diagnostyką i orkiestratorem update()'
    });
    defineLoadOrderRule('vilda-data-import-export-before-app', 'vilda_data_import_export.js', 'app.js', {
      description: 'Neutralne helpery importu/eksportu JSON powinny być dostępne przed app.js'
    });
    defineLoadOrderRule('app-before-patient-report', 'app.js', 'vilda_patient_report.js', {
      description: 'Raport pacjenta korzysta z globalnych helperów i stanu przygotowanych przez app.js'
    });
    defineLoadOrderRule('app-before-diet-recommendations', 'app.js', 'vilda_diet_recommendations.js', {
      description: 'Moduł zaleceń dietetycznych korzysta z globalnych helperów i stanu przygotowanych przez app.js'
    });
    defineLoadOrderRule('diet-recommendations-before-patient-report', 'vilda_diet_recommendations.js', 'vilda_patient_report.js', {
      description: 'Raport pacjenta sprawdza dostępność PDF zaleceń dietetycznych i może pobierać strony tego raportu'
    });
    defineLoadOrderRule('patient-report-before-nutrition-norms', 'vilda_patient_report.js', 'nutrition_norms.js', {
      description: 'Mostki raportu pacjenta powinny być dostępne przed modułami norm żywieniowych, które mogą odświeżać podsumowanie',
      required: false
    });
    defineLoadOrderRule('jspdf-before-app', 'jspdf.umd.min.js', 'app.js', {
      description: 'jsPDF powinien być dostępny przed eksportami PDF w app.js',
      required: false
    });
    defineLoadOrderRule('html2canvas-before-app', 'html2canvas.min.js', 'app.js', {
      description: 'html2canvas powinien być dostępny przed eksportami PDF opartymi o canvas',
      required: false
    });
    defineLoadOrderRule('centile-data-before-app', 'centile_data.js', 'app.js', {
      description: 'Dane centylowe powinny ładować się przed logiką raportów centylowych',
      required: false
    });
    defineLoadOrderRule('xlsx-before-app', 'xlsx.full.min.js', 'app.js', {
      description: 'SheetJS powinien być dostępny przed importem/eksportem XLSX',
      required: false
    });
    defineLoadOrderRule('advanced-growth-before-app', 'advanced_growth_kowd.js', 'app.js', {
      description: 'Zaawansowane helpery wzrastania powinny być dostępne przed raportami app.js',
      required: false
    });
    defineLoadOrderRule('vilda-advanced-growth-before-app', 'vilda_advanced_growth.js', 'app.js', {
      description: 'Helpery i UI advanced growth wydzielone w 8O-1–8O-5 muszą być dostępne przed app.js',
      required: true
    });
    defineLoadOrderRule('vilda-estimated-intake-before-app', 'vilda_estimated_intake.js', 'app.js', {
      description: 'Moduł helperów estimated intake z 8O-9b–8O-9f powinien być dostępny przed wrapperami app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('growth-reference-data-before-app', 'vilda_growth_reference_data.js', 'app.js', {
      description: 'Statyczne dane BMI/LMS/WHO-WFL z 8Q-1 powinny być dostępne przed aliasami app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('professional-module-before-app', 'vilda_professional_module.js', 'app.js', {
      description: 'Moduł profesjonalny z 8Q-2 powinien być dostępny przed mostkiem init w app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('persist-runtime-before-app', 'vilda_persist_runtime.js', 'app.js', {
      description: 'Runtime persistence/autosave/restore z 8Q-3 powinien być dostępny przed mostkiem init w app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('summary-cards-before-app', 'vilda_summary_cards.js', 'app.js', {
      description: 'Karty podsumowań/metabolic summary UI z 8Q-4 powinny być dostępne przed mostkiem init w app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('diet-plan-ui-before-app', 'vilda_diet_plan_ui.js', 'app.js', {
      description: 'Diet plan / energy plan renderer z 8Q-5 powinien być dostępny przed mostkiem init w app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });

    defineLoadOrderRule('diet-plan-ui-before-estimated-intake-ui', 'vilda_diet_plan_ui.js', 'vilda_estimated_intake_ui.js', {
      description: 'Energy mode badge renderer z 8Q-5 powinien być dostępny przed rendererem wyników estimated intake z 8Q-6',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('estimated-intake-ui-before-runtime', 'vilda_estimated_intake_ui.js', 'vilda_estimated_intake_runtime.js', {
      description: 'Renderer wyników estimated intake z 8Q-6 powinien ładować się przed runtime adapterem 8Q-7 w sekwencji modułów estimated intake',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('estimated-intake-runtime-before-app', 'vilda_estimated_intake_runtime.js', 'app.js', {
      description: 'Runtime efektów ubocznych estimated intake z 8Q-7 powinien być dostępny przed calcEstimatedIntake() w app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('estimated-intake-runtime-before-input-model', 'vilda_estimated_intake_runtime.js', 'vilda_estimated_intake_input_model.js', {
      description: 'Runtime efektów ubocznych estimated intake z 8Q-7 pozostaje wcześniejszy w sekwencji modułów estimated intake niż adapter input/observed z 8Q-8',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('estimated-intake-input-model-before-app', 'vilda_estimated_intake_input_model.js', 'app.js', {
      description: 'Adapter input/observed estimated intake z 8Q-8 powinien być dostępny przed calcEstimatedIntake() w app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('estimated-intake-input-model-before-dom-mount', 'vilda_estimated_intake_input_model.js', 'vilda_estimated_intake_dom_mount.js', {
      description: 'Adapter input/observed estimated intake z 8Q-8 pozostaje wcześniejszy niż adapter DOM mount z 8Q-9 w sekwencji modułów estimated intake',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('estimated-intake-dom-mount-before-app', 'vilda_estimated_intake_dom_mount.js', 'app.js', {
      description: 'Adapter DOM mount estimated intake z 8Q-9 powinien być dostępny przed calcEstimatedIntake() w app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('estimated-intake-ui-before-app', 'vilda_estimated_intake_ui.js', 'app.js', {
      description: 'Renderer wyników estimated intake z 8Q-6 powinien być dostępny przed calcEstimatedIntake() w app.js',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('app-before-smoke-tests', 'app.js', 'vilda_smoke_tests.js', {
      description: 'Stały smoke suite 8O-T1 powinien ładować się po app.js, aby widzieć wrappery i snapshoty read-only',
      required: true,
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html']
    });
    defineLoadOrderRule('bayley-pinneau-before-app', 'bayley_pinneau_data.js', 'app.js', {
      description: 'Dane Bayley-Pinneau powinny ładować się przed predykcją wzrostu',
      required: false
    });
    defineLoadOrderRule('rwt-before-app', 'rwt_data.js', 'app.js', {
      description: 'Dane RWT powinny ładować się przed predykcją wzrostu',
      required: false
    });
    defineLoadOrderRule('reinehr-before-app', 'reinehr_cdgp_data.js', 'app.js', {
      description: 'Dane Reinehr/CDGP powinny ładować się przed predykcją wzrostu',
      required: false
    });

    defineModuleDeps('patient-report-pdf', [JS_PDF, HTML2CANVAS], {
      description: 'Raport pacjenta PDF',
      pages: ['index.html', 'docpro.html'],
      script: 'vilda_patient_report.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('diet-recommendations-pdf', [JS_PDF, HTML2CANVAS], {
      description: 'PDF zaleceń dietetycznych',
      pages: ['index.html', 'docpro.html'],
      script: 'vilda_diet_recommendations.js',
      loadAfter: ['vilda_deps.js', 'app.js']
    });

    defineModuleDeps('main-bmi-metabolism-pdf', [JS_PDF], {
      description: 'Główny raport BMI/metabolizmu',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('patient-report-selected-pdf', [JS_PDF], {
      description: 'Eksport wybranych stron raportu pacjenta',
      pages: ['index.html', 'docpro.html'],
      script: 'vilda_patient_report.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('patient-report-visit-pages', [JS_PDF, HTML2CANVAS], {
      description: 'Dodatkowe strony PDF po wizycie',
      pages: ['index.html', 'docpro.html'],
      script: 'vilda_patient_report.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('advanced-growth-pdf', [JS_PDF, HTML2CANVAS], {
      description: 'PDF zaawansowanego wzrastania',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('patient-report-centile-chart', [
      CENTILE_DATA,
      GET_CHART_STATE,
      GENERATE_CENTILE,
      GENERATE_PAL,
      BUILD_CENTILE_CANVAS,
      EFFECTIVE_CENTILE_STATE,
      COLLECT_AGES
    ], {
      description: 'Wykresy centylowe w raporcie pacjenta',
      pages: ['index.html', 'docpro.html'],
      script: 'vilda_patient_report.js',
      loadAfter: ['vilda_deps.js', 'centile_data.js']
    });

    defineModuleDeps('growth-basic-module-chart', [CENTILE_DATA, GENERATE_CENTILE], {
      description: 'Podstawowy moduł wzrastania — wykres centylowy',
      pages: ['index.html'],
      script: 'growth-basic-module.js',
      loadAfter: ['vilda_deps.js', 'centile_data.js']
    });

    defineModuleDeps('palczewska-centile-reference', [CENTILE_DATA], {
      description: 'Referencja centylowa Palczewskiej',
      pages: ['index.html', 'docpro.html'],
      script: 'app.js',
      loadAfter: ['centile_data.js']
    });

    defineModuleDeps('patient-report-advanced-growth', [
      { path: 'advGrowthCollectHistoricalPointsForReport', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'generateAdvancedGrowthPdfReport', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advGrowthBuildReportRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advGrowthBuildHtmlReportMarkup', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      HTML2CANVAS
    ], {
      description: 'Zaawansowane wzrastanie w raporcie pacjenta',
      pages: ['index.html'],
      script: 'vilda_patient_report.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js']
    });

    defineModuleDeps('advanced-growth-bayley-pinneau', [
      { path: 'bayleyPinneauData', type: 'object', source: 'bayley_pinneau_data.js', script: 'bayley_pinneau_data.js' }
    ], {
      description: 'Dane Bayley-Pinneau',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['bayley_pinneau_data.js']
    });

    defineModuleDeps('advanced-growth-rwt', [
      { path: 'rwtData', type: 'object', source: 'rwt_data.js', script: 'rwt_data.js' }
    ], {
      description: 'Dane Roche-Wainer-Thissen',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['rwt_data.js']
    });

    defineModuleDeps('advanced-growth-reinehr', [
      { path: 'reinehrCdgpData', type: 'object', source: 'reinehr_cdgp_data.js', script: 'reinehr_cdgp_data.js' },
      { path: 'advGrowthCalculateReinehrCdgpPrediction', type: 'function', source: 'advanced_growth_kowd.js', script: 'advanced_growth_kowd.js' }
    ], {
      description: 'Prognoza Reinehr/CDGP',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['reinehr_cdgp_data.js', 'advanced_growth_kowd.js']
    });

    defineModuleDeps('advanced-growth-prediction-engines', [
      { path: 'bayleyPinneauData', type: 'object', source: 'bayley_pinneau_data.js', script: 'bayley_pinneau_data.js' },
      { path: 'rwtData', type: 'object', source: 'rwt_data.js', script: 'rwt_data.js' },
      { path: 'advGrowthCalculateReinehrCdgpPrediction', type: 'function', source: 'advanced_growth_kowd.js', script: 'advanced_growth_kowd.js', required: false },
      { path: 'VildaAdvancedGrowth.calculateBayleyPinneauPrediction', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.calculateRWTPrediction', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.calculateReinehrCdgpPrediction', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advGrowthBuildPredictionReliabilityModel', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.buildBayleyPinneauResultHtml', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.buildRWTResultHtml', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' }
    ], {
      description: 'Silniki predykcyjne advanced growth Bayley-Pinneau/RWT oraz delegacja Reinehr/CDGP i model wiarygodności wydzielone w 8O-6',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'bayley_pinneau_data.js', 'rwt_data.js', 'reinehr_cdgp_data.js', 'advanced_growth_kowd.js']
    });

    defineModuleDeps('advanced-growth-calculation-adapters', [
      { path: 'VildaAdvancedGrowth.collectAdvancedGrowthCalculationInput', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.buildAdvancedGrowthDataPayload', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.commitAdvancedGrowthDataPayload', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.clearAdvancedGrowthDataPayload', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'collectAdvancedGrowthCalculationInput', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'buildAdvancedGrowthDataPayload', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'commitAdvancedGrowthDataPayload', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'clearAdvancedGrowthDataPayload', type: 'function', source: 'app.js', script: 'app.js', required: false }
    ], {
      description: 'Adapter wejścia/wyjścia dla calculateGrowthAdvanced() przygotowany w 8O-7a bez przenoszenia orkiestratora',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'app.js']
    });

    defineModuleDeps('advanced-growth-lifecycle-adapters', [
      { path: 'VildaAdvancedGrowth.clearAdvancedGrowthCalculationState', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.commitAdvancedGrowthCalculationState', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.finalizeAdvancedGrowthCalculationLifecycle', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'clearAdvancedGrowthCalculationState', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'commitAdvancedGrowthCalculationState', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'finalizeAdvancedGrowthCalculationLifecycle', type: 'function', source: 'app.js', script: 'app.js', required: false }
    ], {
      description: 'Adaptery lifecycle advanced growth przygotowane w 8O-7b: clear/commit/finalize bez przenoszenia calculateGrowthAdvanced()',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'app.js']
    });

    defineModuleDeps('advanced-growth-calculation-orchestrator', [
      { path: 'VildaAdvancedGrowth.calculateGrowthAdvanced', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'calculateGrowthAdvanced', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'collectAdvancedGrowthCalculationInput', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'buildAdvancedGrowthDataPayload', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'commitAdvancedGrowthCalculationState', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'finalizeAdvancedGrowthCalculationLifecycle', type: 'function', source: 'app.js', script: 'app.js', required: false }
    ], {
      description: 'calculateGrowthAdvanced() przeniesiony do VildaAdvancedGrowth w 8O-7c z wrapperem kompatybilnościowym w app.js',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'app.js', 'bayley_pinneau_data.js', 'rwt_data.js', 'reinehr_cdgp_data.js', 'advanced_growth_kowd.js']
    });

    defineModuleDeps('advanced-growth-post-orchestrator-validation', [
      { path: 'VildaAdvancedGrowth.calculateGrowthAdvanced', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'calculateGrowthAdvanced', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'VildaAdvancedGrowth.generateAdvancedGrowthPdfReport', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'generateAdvancedGrowthPdfReport', type: 'function', source: 'app.js/vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advGrowthBuildHtmlReportMarkup', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advGrowthBuildHtmlReportMarkup', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'importTherapyPointsToAdvancedGrowth', type: 'function', source: 'app.js/vilda_advanced_growth.js', script: 'app.js' },
      { path: 'VildaDataImportExport.hasMeaningfulMainSessionData', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'clearAllData', type: 'function', source: 'app.js/vilda_data_import_export.js', script: 'app.js' },
      { path: 'restoreLoadedState', type: 'function', source: 'app.js/vilda_data_import_export.js', script: 'app.js' },
      { path: 'syncAdvancedGrowthRowsToBasic', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'refreshEstimatedIntakeVisibility', type: 'function', source: 'app.js', script: 'app.js', required: false }
    ], {
      description: 'Walidacja 8O-7d po przeniesieniu orkiestratora: obliczenia advanced growth, raport, JSON/clear, GH/IGF i estimated intake pozostają dostępne przez dotychczasowe aliasy',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_data_import_export.js', 'vilda_advanced_growth.js', 'app.js']
    });


    defineModuleDeps('advanced-growth-intake-sync-audit', [
      { path: 'vildaGetAdvancedIntakeSyncAuditSnapshot', type: 'function', source: 'app.js', script: 'app.js' },
      { path: '_pairAdvancedAndIntakeRowsByOrder', type: 'function', source: 'app.js', script: 'app.js' },
      { path: '_syncAdvRowToIntake', type: 'function', source: 'app.js', script: 'app.js' },
      { path: '_syncIntakeRowToAdv', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleAdvancedMeasurementAdd', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleIntakeHistoryAdd', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleAdvancedMeasurementRowRemove', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleIntakeHistoryRowRemove', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'vildaEnsureAdvancedIntakePairing', type: 'function', source: 'app.js DOM-ready alias', script: 'app.js', required: false },
      { path: 'vildaHandleAdvancedMeasurementAdd', type: 'function', source: 'app.js DOM-ready alias', script: 'app.js', required: false },
      { path: 'vildaHandleIntakeHistoryAdd', type: 'function', source: 'app.js DOM-ready alias', script: 'app.js', required: false }
    ], {
      description: 'Audyt 8O-8a: mapa i diagnostyka synchronizacji advanced growth ↔ estimated intake przed wydzielaniem logiki parowania',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'vilda_data_import_export.js', 'app.js']
    });


    defineModuleDeps('advanced-growth-intake-sync-helpers', [
      { path: 'VildaAdvancedGrowth.advIntakeGetIntakeRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetAdvancedRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetIntakeHistoryRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetSyncId', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeSetSyncId', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeFindAdvancedRowBySyncId', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeFindIntakeHistoryRowBySyncId', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetUserBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetCompleteCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeApproxEq', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeAdvRowAgeMonths', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeIntakeRowAgeMonths', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetRawInputValue', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeRowHasAnyData', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeAdvRowHasAnyData', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeIntakeRowHasAnyData', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeRowMatchesCurrentBasicsByMetrics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeIntakeHistoryRowDuplicatesCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeAdvancedHistoryRowDuplicatesCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeIsProtectedAdvancedHistoryRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeIsProtectedIntakeHistoryRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeBuildAuditSnapshot', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: '_intkRows', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_advRows', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_getIntakeHistoryRows', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_getAdvIntakeSyncId', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_setAdvIntakeSyncId', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_advRowAgeMonths', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_intakeRowAgeMonths', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_advRowHasAnyData', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_intakeRowHasAnyData', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: 'vildaGetAdvancedIntakeSyncAuditSnapshot', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false }
    ], {
      description: '8O-8b: neutralne helpery odczytu DOM, syncId, wieku i detekcji danych dla synchronizacji advanced growth ↔ estimated intake; parowanie i event wiring pozostają w app.js',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'app.js']
    });



    defineModuleDeps('advanced-growth-intake-sync-row-operations', [
      { path: 'VildaAdvancedGrowth.copyAdvancedIntakeValueIfTargetEmpty', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.backfillAdvancedIntakeHistoryRowFromAdvancedRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.backfillAdvancedIntakeAdvancedRowFromHistoryRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.syncAdvancedIntakeAdvancedRowToHistoryRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.syncAdvancedIntakeHistoryRowToAdvancedRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: '_copyValueIfTargetEmpty', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_backfillIntakeRowFromAdv', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_backfillAdvRowFromIntake', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_syncAdvRowToIntake', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_syncIntakeRowToAdv', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_pairAdvancedAndIntakeRowsByOrder', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleAdvancedMeasurementAdd', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleIntakeHistoryAdd', type: 'function', source: 'app.js', script: 'app.js' }
    ], {
      description: '8O-8c: operacje kopiowania/backfill pojedynczego wiersza advanced growth ↔ estimated intake są delegowane do VildaAdvancedGrowth; parowanie, event wiring oraz add/remove handlers pozostają w app.js',
      pages: ['index.html'],
      script: 'vilda_advanced_growth.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'app.js']
    });


    defineModuleDeps('advanced-growth-intake-sync-pairing', [
      { path: 'VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetAdvancedRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetIntakeHistoryRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetSyncId', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeSetSyncId', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.backfillAdvancedIntakeHistoryRowFromAdvancedRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.backfillAdvancedIntakeAdvancedRowFromHistoryRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.syncAdvancedIntakeAdvancedRowToHistoryRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.syncAdvancedIntakeHistoryRowToAdvancedRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: '_getAdvIntakePairingOptions', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: '_pairAdvancedAndIntakeRowsByOrder', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: 'handleAdvancedMeasurementAdd', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleIntakeHistoryAdd', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleAdvancedMeasurementRowRemove', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'handleIntakeHistoryRowRemove', type: 'function', source: 'app.js', script: 'app.js' }
    ], {
      description: '8O-8d: parowanie list wierszy advanced growth ↔ estimated intake jest delegowane do VildaAdvancedGrowth; po 8O-8e handlery add/remove są delegowane osobnym kontraktem, a event wiring pozostaje w app.js',
      pages: ['index.html'],
      script: 'vilda_advanced_growth.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'app.js']
    });



    defineModuleDeps('advanced-growth-intake-sync-handlers', [
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementAdd', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeHistoryAdd', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementRowRemove', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeHistoryRowRemove', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetAdvancedRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeGetIntakeHistoryRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advIntakeSetSyncId', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: '_getAdvIntakeHandlerOptions', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: 'handleAdvancedMeasurementAdd', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleIntakeHistoryAdd', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleAdvancedMeasurementRowRemove', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleIntakeHistoryRowRemove', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'window.vildaHandleAdvancedMeasurementAdd', type: 'function', source: 'app.js ready wiring', script: 'app.js', required: false },
      { path: 'window.vildaHandleIntakeHistoryAdd', type: 'function', source: 'app.js ready wiring', script: 'app.js', required: false },
      { path: 'window.vildaHandleAdvancedMeasurementRowRemove', type: 'function', source: 'app.js ready wiring', script: 'app.js', required: false },
      { path: 'window.vildaHandleIntakeHistoryRowRemove', type: 'function', source: 'app.js ready wiring', script: 'app.js', required: false }
    ], {
      description: '8O-8e: handlery add/remove synchronizacji advanced growth ↔ estimated intake są delegowane do VildaAdvancedGrowth; od 8O-8f event wiring ma osobny kontrakt',
      pages: ['index.html'],
      script: 'vilda_advanced_growth.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'app.js']
    });



    defineModuleDeps('advanced-growth-intake-sync-live-wiring', [
      { path: 'VildaAdvancedGrowth.setupAdvancedIntakeLiveWiring', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'setupAdvancedIntakeLiveWiring', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: '_getAdvIntakeLiveWiringOptions', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: 'VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.syncAdvancedIntakeAdvancedRowToHistoryRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.syncAdvancedIntakeHistoryRowToAdvancedRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementAdd', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeHistoryAdd', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementRowRemove', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeHistoryRowRemove', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'handleAdvancedMeasurementAdd', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleIntakeHistoryAdd', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleAdvancedMeasurementRowRemove', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleIntakeHistoryRowRemove', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'window.vildaEnsureAdvancedIntakePairing', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false },
      { path: 'window.vildaHandleAdvancedMeasurementAdd', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false },
      { path: 'window.vildaHandleIntakeHistoryAdd', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false },
      { path: 'window.vildaHandleAdvancedMeasurementRowRemove', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false },
      { path: 'window.vildaHandleIntakeHistoryRowRemove', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false }
    ], {
      description: '8O-8f: event wiring input/change synchronizacji advanced growth ↔ estimated intake jest delegowany do VildaAdvancedGrowth przez wrapper app.js',
      pages: ['index.html'],
      script: 'vilda_advanced_growth.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js', 'app.js']
    });




    defineModuleDeps('advanced-growth-intake-sync-final-validation', [
      { path: 'VildaAdvancedGrowth.advIntakeBuildAuditSnapshot', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'vildaGetAdvancedIntakeSyncAuditSnapshot', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'VildaAdvancedGrowth.setupAdvancedIntakeLiveWiring', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'setupAdvancedIntakeLiveWiring', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'VildaAdvancedGrowth.pairAdvancedIntakeRowsByOrder', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: '_pairAdvancedAndIntakeRowsByOrder', type: 'function', source: 'app.js wrapper', script: 'app.js', required: false },
      { path: 'VildaAdvancedGrowth.syncAdvancedIntakeAdvancedRowToHistoryRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.syncAdvancedIntakeHistoryRowToAdvancedRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementAdd', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeHistoryAdd', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeAdvancedMeasurementRowRemove', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.handleAdvancedIntakeHistoryRowRemove', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'handleAdvancedMeasurementAdd', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleIntakeHistoryAdd', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleAdvancedMeasurementRowRemove', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'handleIntakeHistoryRowRemove', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'calculateGrowthAdvanced', type: 'function', source: 'app.js wrapper/VildaAdvancedGrowth', script: 'app.js' },
      { path: 'calcEstimatedIntake', type: 'function', source: 'app.js estimated intake card', script: 'app.js' },
      { path: 'intakeAddRow', type: 'function', source: 'app.js estimated intake card', script: 'app.js', required: false },
      { path: 'VildaDataImportExport.hasMeaningfulMainSessionData', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'clearAllData', type: 'function', source: 'app.js/vilda_data_import_export.js', script: 'app.js' },
      { path: 'restoreLoadedState', type: 'function', source: 'app.js/vilda_data_import_export.js', script: 'app.js' },
      { path: 'importTherapyPointsToAdvancedGrowth', type: 'function', source: 'app.js/vilda_advanced_growth.js', script: 'app.js' },
      { path: 'generateAdvancedGrowthPdfReport', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advGrowthBuildHtmlReportMarkup', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'window.vildaEnsureAdvancedIntakePairing', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false },
      { path: 'window.vildaHandleAdvancedMeasurementAdd', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false },
      { path: 'window.vildaHandleIntakeHistoryAdd', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false },
      { path: 'window.vildaHandleAdvancedMeasurementRowRemove', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false },
      { path: 'window.vildaHandleIntakeHistoryRowRemove', type: 'function', source: 'setupAdvancedIntakeLiveWiring()', script: 'app.js', required: false }
    ], {
      description: '8O-8g: końcowy kontrakt walidacyjny pełnej synchronizacji advanced growth ↔ estimated intake po wydzieleniu helperów, operacji, parowania, handlerów i event wiring; bez kolejnego refaktoru funkcjonalnego',
      pages: ['index.html'],
      script: 'vilda_advanced_growth.js/app.js/vilda_data_import_export.js',
      loadAfter: ['vilda_deps.js', 'vilda_data_import_export.js', 'vilda_advanced_growth.js', 'app.js']
    });

    defineModuleDeps('estimated-intake-card-audit', [
      { path: 'vildaGetEstimatedIntakeAuditSnapshot', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'readIntakeRows', type: 'function', source: 'app.js estimated intake card wrapper', script: 'app.js' },
      { path: 'getIntakeRowHeight', type: 'function', source: 'app.js estimated intake card wrapper', script: 'app.js' },
      { path: 'buildIntakeIntervals', type: 'function', source: 'app.js estimated intake card wrapper', script: 'app.js' },
      { path: 'calcEstimatedIntake', type: 'function', source: 'app.js estimated intake card', script: 'app.js' },
      { path: 'setupEstimatedIntake', type: 'function', source: 'app.js estimated intake card', script: 'app.js', required: false },
      { path: 'intakeAddRow', type: 'function', source: 'app.js estimated intake card', script: 'app.js', required: false },
      { path: 'vildaGetAdvancedIntakeSyncAuditSnapshot', type: 'function', source: 'app.js', script: 'app.js', required: false }
    ], {
      description: '8O-9a/8O-9e: read-only audyt karty estimated intake, kompatybilne wrappery helperów i snapshot seamu calcEstimatedIntake()',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_data_import_export.js', 'vilda_advanced_growth.js', 'vilda_estimated_intake.js', 'app.js']
    });

    defineModuleDeps('estimated-intake-card-helpers', [
      { path: 'VildaEstimatedIntake', type: 'object', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'VildaEstimatedIntake.readIntakeRows', type: 'function', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'VildaEstimatedIntake.getIntakeRowHeight', type: 'function', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'VildaEstimatedIntake.buildIntakeIntervals', type: 'function', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'VildaEstimatedIntake.collectIntakeRowsForAlertProbe', type: 'function', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel', type: 'function', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'VildaEstimatedIntake.getApiSurfaceStatus', type: 'function', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js', required: false },
      { path: 'readIntakeRows', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'getIntakeRowHeight', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'buildIntakeIntervals', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'collectIntakeRowsForAlertProbe', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'calcEstimatedIntake', type: 'function', source: 'app.js estimated intake card', script: 'app.js' },
      { path: 'vildaGetEstimatedIntakeAuditSnapshot', type: 'function', source: 'app.js', script: 'app.js', required: false }
    ], {
      description: '8O-9b/8O-9f: neutralne helpery, kolektor alert-probe i czysty model obliczeniowy estimated intake wydzielone do vilda_estimated_intake.js; app.js zachowuje wrappery, commit window.* i alert decision',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_estimated_intake.js', 'app.js']
    });

    defineModuleDeps('estimated-intake-alert-probe-audit', [
      { path: 'vildaGetEstimatedIntakeAuditSnapshot', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'vildaGetEstimatedIntakeAlertProbeAuditSnapshot', type: 'function', source: 'app.js', script: 'app.js' },
      { path: 'collectIntakeRowsForAlertProbe', type: 'function', source: 'app.js estimated intake alert probe wrapper', script: 'app.js' },
      { path: 'VildaEstimatedIntake.collectIntakeRowsForAlertProbe', type: 'function', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js', required: false },
      { path: 'hasPotentialIntakeAlerts', type: 'function', source: 'app.js estimated intake alert probe', script: 'app.js' },
      { path: 'getUserBasics', type: 'function', source: 'app.js patient input adapter', script: 'app.js' },
      { path: 'readIntakeRows', type: 'function', source: 'app.js wrapper / vilda_estimated_intake.js', script: 'app.js' },
      { path: 'getIntakeRowHeight', type: 'function', source: 'app.js wrapper / vilda_estimated_intake.js', script: 'app.js' },
      { path: 'buildIntakeIntervals', type: 'function', source: 'app.js wrapper / vilda_estimated_intake.js', script: 'app.js' },
      { path: 'energyBuildIntakeObservedState', type: 'function', source: 'vilda_diet_plan_ui.js energy model', script: 'vilda_diet_plan_ui.js' },
      { path: 'energyIsNumeric', type: 'function', source: 'vilda_diet_plan_ui.js energy model', script: 'vilda_diet_plan_ui.js' },
      { path: 'detectAnRisk', type: 'function', source: 'vilda_anorexia_risk.js/app.js', script: 'vilda_anorexia_risk.js', required: false },
      { path: 'has12mLossOrangeRisk', type: 'function', source: 'vilda_anorexia_risk.js/app.js', script: 'vilda_anorexia_risk.js', required: false }
    ], {
      description: '8O-9c/8O-9d-lite: read-only audyt funkcji alertowych oraz status delegacji collectIntakeRowsForAlertProbe(); hasPotentialIntakeAlerts() pozostaje w app.js i nie jest uruchamiany przez audyt',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_anorexia_risk.js', 'vilda_estimated_intake.js', 'app.js']
    });


    defineModuleDeps('estimated-intake-alert-probe-collector', [
      { path: 'VildaEstimatedIntake', type: 'object', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'VildaEstimatedIntake.collectIntakeRowsForAlertProbe', type: 'function', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'collectIntakeRowsForAlertProbe', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'hasPotentialIntakeAlerts', type: 'function', source: 'app.js alert decision', script: 'app.js' },
      { path: 'getUserBasics', type: 'function', source: 'app.js patient input adapter', script: 'app.js' },
      { path: 'readIntakeRows', type: 'function', source: 'app.js wrapper / vilda_estimated_intake.js', script: 'app.js' },
      { path: 'getIntakeRowHeight', type: 'function', source: 'app.js wrapper / vilda_estimated_intake.js', script: 'app.js' },
      { path: 'vildaGetEstimatedIntakeAlertProbeAuditSnapshot', type: 'function', source: 'app.js', script: 'app.js', required: false }
    ], {
      description: '8O-9d-lite/8O-9e: collectIntakeRowsForAlertProbe() wydzielony do vilda_estimated_intake.js jako helper DI; hasPotentialIntakeAlerts() zostaje w app.js do rozdzielenia modelu, alertów i renderowania',
      pages: ['index.html'],
      script: 'vilda_estimated_intake.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_estimated_intake.js', 'app.js']
    });

    defineModuleDeps('estimated-intake-calc-seam', [
      { path: 'vildaGetEstimatedIntakeCalcSeamSnapshot', type: 'function', source: 'app.js seam audit', script: 'app.js' },
      { path: 'buildEstimatedIntakeCalcInputModel', type: 'function', source: 'app.js wrapper / vilda_estimated_intake_input_model.js', script: 'app.js' },
      { path: 'buildEstimatedIntakeLastObservedModel', type: 'function', source: 'app.js wrapper / vilda_estimated_intake_input_model.js', script: 'app.js' },
      { path: 'buildEstimatedIntakeCalculationModel', type: 'function', source: 'app.js calc model wrapper', script: 'app.js' },
      { path: 'commitEstimatedIntakeCalcModelWindowState', type: 'function', source: 'app.js calc model commit adapter', script: 'app.js' },
      { path: 'runEstimatedIntakePostRenderRisk', type: 'function', source: 'app.js post-render risk adapter', script: 'app.js' },
      { path: 'buildEstimatedIntakeHistoryForRisk', type: 'function', source: 'app.js wrapper / vilda_estimated_intake_input_model.js', script: 'app.js' },
      { path: 'buildEstimatedIntakeWindowHistory', type: 'function', source: 'app.js calc seam', script: 'app.js' },
      { path: 'getEstimatedIntakeCalcOutputTargets', type: 'function', source: 'app.js calc seam', script: 'app.js' },
      { path: 'buildEstimatedIntakeResultsRenderModel', type: 'function', source: 'app.js renderer adapter 8Q-6', script: 'app.js' },
      { path: 'applyEstimatedIntakeResultsRenderModel', type: 'function', source: 'app.js DOM mount adapter 8Q-6', script: 'app.js' },
      { path: 'commitEstimatedIntakeWindowState', type: 'function', source: 'app.js calc seam', script: 'app.js' },
      { path: 'clearEstimatedIntakeWindowState', type: 'function', source: 'app.js calc seam', script: 'app.js' },
      { path: 'calcEstimatedIntake', type: 'function', source: 'app.js estimated intake card', script: 'app.js' },
      { path: 'readIntakeRows', type: 'function', source: 'app.js wrapper / vilda_estimated_intake.js', script: 'app.js' },
      { path: 'buildIntakeIntervals', type: 'function', source: 'app.js wrapper / vilda_estimated_intake.js', script: 'app.js' },
      { path: 'vildaGetEstimatedIntakeAuditSnapshot', type: 'function', source: 'app.js parent audit', script: 'app.js', required: false }
    ], {
      description: '8O-9e/8O-9f/8Q-8: seam wejścia/wyjścia calcEstimatedIntake() z delegowanym input/observed adapterem i czystym modelem obliczeniowym; read-only snapshot bez renderowania DOM i bez zapisu window.*',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_estimated_intake.js', 'app.js']
    });


    defineModuleDeps('estimated-intake-calculation-model', [
      { path: 'VildaEstimatedIntake', type: 'object', source: 'vilda_estimated_intake.js', script: 'vilda_estimated_intake.js' },
      { path: 'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel', type: 'function', source: 'vilda_estimated_intake.js pure model', script: 'vilda_estimated_intake.js' },
      { path: 'buildEstimatedIntakeCalculationModel', type: 'function', source: 'app.js wrapper', script: 'app.js' },
      { path: 'buildEstimatedIntakeCalculationModelFallback', type: 'function', source: 'app.js fallback', script: 'app.js', required: false },
      { path: 'commitEstimatedIntakeCalcModelWindowState', type: 'function', source: 'app.js window-state commit adapter', script: 'app.js' },
      { path: 'runEstimatedIntakePostRenderRisk', type: 'function', source: 'app.js post-render risk adapter', script: 'app.js' },
      { path: 'buildEstimatedIntakeCalcInputModel', type: 'function', source: 'app.js wrapper / vilda_estimated_intake_input_model.js', script: 'app.js' },
      { path: 'buildEstimatedIntakeLastObservedModel', type: 'function', source: 'app.js wrapper / vilda_estimated_intake_input_model.js', script: 'app.js' },
      { path: 'calcEstimatedIntake', type: 'function', source: 'app.js orchestrator/render', script: 'app.js' },
      { path: 'vildaGetEstimatedIntakeCalculationModelSnapshot', type: 'function', source: 'app.js calculation model audit', script: 'app.js' },
      { path: 'vildaGetEstimatedIntakeCalcSeamSnapshot', type: 'function', source: 'app.js calc seam audit', script: 'app.js', required: false }
    ], {
      description: '8O-9f/8Q-6/8Q-8: czysty model obliczeniowy estimated intake jest delegowany do VildaEstimatedIntake, input/observed model do VildaEstimatedIntakeInputModel, a HTML wyników do VildaEstimatedIntakeUI; app.js nadal montuje DOM, commituje window.* i wykonuje post-render risk checks',
      pages: ['index.html'],
      script: 'vilda_estimated_intake.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_estimated_intake.js', 'app.js']
    });






    defineModuleDeps('estimated-intake-ui', [
      { path: 'VildaEstimatedIntakeUI', type: 'object', source: 'vilda_estimated_intake_ui.js 8Q-6 API', script: 'vilda_estimated_intake_ui.js' },
      { path: 'VildaEstimatedIntakeUI.buildResultsHtml', type: 'function', source: 'vilda_estimated_intake_ui.js pure renderer', script: 'vilda_estimated_intake_ui.js' },
      { path: 'VildaEstimatedIntakeUI.buildEmptyResultsHtml', type: 'function', source: 'vilda_estimated_intake_ui.js empty branch renderer', script: 'vilda_estimated_intake_ui.js' },
      { path: 'VildaEstimatedIntakeUI.buildSingleRowResultsHtml', type: 'function', source: 'vilda_estimated_intake_ui.js single-row renderer', script: 'vilda_estimated_intake_ui.js' },
      { path: 'VildaEstimatedIntakeUI.buildIntervalResultsHtml', type: 'function', source: 'vilda_estimated_intake_ui.js interval renderer', script: 'vilda_estimated_intake_ui.js' },
      { path: 'VildaEstimatedIntakeUI.getSnapshot', type: 'function', source: 'vilda_estimated_intake_ui.js read-only snapshot', script: 'vilda_estimated_intake_ui.js' },
      { path: 'vildaGetEstimatedIntakeUiSnapshot', type: 'function', source: 'vilda_estimated_intake_ui.js global snapshot alias', script: 'vilda_estimated_intake_ui.js' },
      { path: 'buildEstimatedIntakeResultsRenderModel', type: 'function', source: 'app.js renderer adapter 8Q-6', script: 'app.js' },
      { path: 'applyEstimatedIntakeResultsRenderModel', type: 'function', source: 'app.js wrapper / vilda_estimated_intake_dom_mount.js controlled DOM mount 8Q-9', script: 'app.js' },
      { path: 'calcEstimatedIntake', type: 'function', source: 'app.js orchestrator', script: 'app.js' }
    ], {
      description: '8Q-6/8Q-9: HTML wyników estimated intake pozostaje w czystym rendererze VildaEstimatedIntakeUI, a mount DOM/legenda są delegowane do VildaEstimatedIntakeDomMount; app.js zachowuje orkiestrację, commit window.* i post-render risk checks',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_estimated_intake_ui.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_diet_plan_ui.js', 'vilda_estimated_intake_ui.js', 'app.js']
    });



    defineModuleDeps('estimated-intake-runtime', [
      { path: 'VildaEstimatedIntakeRuntime', type: 'object', source: 'vilda_estimated_intake_runtime.js 8Q-7 API', script: 'vilda_estimated_intake_runtime.js' },
      { path: 'VildaEstimatedIntakeRuntime.buildEstimatedIntakeWindowHistory', type: 'function', source: 'vilda_estimated_intake_runtime.js history builder', script: 'vilda_estimated_intake_runtime.js' },
      { path: 'VildaEstimatedIntakeRuntime.clearEstimatedIntakeWindowState', type: 'function', source: 'vilda_estimated_intake_runtime.js clear adapter', script: 'vilda_estimated_intake_runtime.js' },
      { path: 'VildaEstimatedIntakeRuntime.commitEstimatedIntakeWindowState', type: 'function', source: 'vilda_estimated_intake_runtime.js commit adapter', script: 'vilda_estimated_intake_runtime.js' },
      { path: 'VildaEstimatedIntakeRuntime.commitEstimatedIntakeCalcModelWindowState', type: 'function', source: 'vilda_estimated_intake_runtime.js calc model commit adapter', script: 'vilda_estimated_intake_runtime.js' },
      { path: 'VildaEstimatedIntakeRuntime.runEstimatedIntakePostRenderRisk', type: 'function', source: 'vilda_estimated_intake_runtime.js post-render risk adapter', script: 'vilda_estimated_intake_runtime.js' },
      { path: 'VildaEstimatedIntakeRuntime.getSnapshot', type: 'function', source: 'vilda_estimated_intake_runtime.js read-only snapshot', script: 'vilda_estimated_intake_runtime.js' },
      { path: 'vildaGetEstimatedIntakeRuntimeSnapshot', type: 'function', source: 'vilda_estimated_intake_runtime.js global snapshot alias', script: 'vilda_estimated_intake_runtime.js' },
      { path: 'getVildaEstimatedIntakeRuntimeAdapter', type: 'function', source: 'app.js runtime adapter wrapper 8Q-7', script: 'app.js' },
      { path: 'getVildaEstimatedIntakeRuntimeDependencies', type: 'function', source: 'app.js runtime dependency bridge 8Q-7', script: 'app.js' },
      { path: 'commitEstimatedIntakeCalcModelWindowState', type: 'function', source: 'app.js wrapper delegujący do runtime 8Q-7', script: 'app.js' },
      { path: 'runEstimatedIntakePostRenderRisk', type: 'function', source: 'app.js wrapper delegujący do runtime 8Q-7', script: 'app.js' }
    ], {
      description: '8Q-7/8Q-9: efekty uboczne estimated intake po calc modelu są delegowane do VildaEstimatedIntakeRuntime, a mount DOM do VildaEstimatedIntakeDomMount; app.js zachowuje orkiestrację i fallbacki kompatybilnościowe',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_estimated_intake_runtime.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_estimated_intake_ui.js', 'vilda_estimated_intake_runtime.js', 'app.js']
    });

    defineModuleDeps('estimated-intake-input-model', [
      { path: 'VildaEstimatedIntakeInputModel', type: 'object', source: 'vilda_estimated_intake_input_model.js 8Q-8 API', script: 'vilda_estimated_intake_input_model.js' },
      { path: 'VildaEstimatedIntakeInputModel.buildEstimatedIntakeHistoryForRisk', type: 'function', source: 'vilda_estimated_intake_input_model.js historyForRisk builder', script: 'vilda_estimated_intake_input_model.js' },
      { path: 'VildaEstimatedIntakeInputModel.buildEstimatedIntakeCalcInputModel', type: 'function', source: 'vilda_estimated_intake_input_model.js inputModel builder', script: 'vilda_estimated_intake_input_model.js' },
      { path: 'VildaEstimatedIntakeInputModel.buildEstimatedIntakeLastObservedModel', type: 'function', source: 'vilda_estimated_intake_input_model.js lastObservedModel builder', script: 'vilda_estimated_intake_input_model.js' },
      { path: 'VildaEstimatedIntakeInputModel.getEstimatedIntakeCalculationModelDependencies', type: 'function', source: 'vilda_estimated_intake_input_model.js calculation dependency bridge', script: 'vilda_estimated_intake_input_model.js' },
      { path: 'VildaEstimatedIntakeInputModel.getSnapshot', type: 'function', source: 'vilda_estimated_intake_input_model.js read-only snapshot', script: 'vilda_estimated_intake_input_model.js' },
      { path: 'vildaGetEstimatedIntakeInputModelSnapshot', type: 'function', source: 'vilda_estimated_intake_input_model.js global snapshot alias', script: 'vilda_estimated_intake_input_model.js' },
      { path: 'getVildaEstimatedIntakeInputModelAdapter', type: 'function', source: 'app.js input model adapter wrapper 8Q-8', script: 'app.js' },
      { path: 'getVildaEstimatedIntakeInputModelDependencies', type: 'function', source: 'app.js input model dependency bridge 8Q-8', script: 'app.js' },
      { path: 'buildEstimatedIntakeCalcInputModel', type: 'function', source: 'app.js wrapper delegujący do input model 8Q-8', script: 'app.js' },
      { path: 'buildEstimatedIntakeLastObservedModel', type: 'function', source: 'app.js wrapper delegujący do input model 8Q-8', script: 'app.js' },
      { path: 'buildEstimatedIntakeHistoryForRisk', type: 'function', source: 'app.js wrapper delegujący do input model 8Q-8', script: 'app.js' },
      { path: 'getVildaEstimatedIntakeCalculationModelDependencies', type: 'function', source: 'app.js wrapper delegujący do input model 8Q-8', script: 'app.js' }
    ], {
      description: '8Q-8/8Q-9: model wejściowy, historyForRisk, lastObservedModel i zależności calc modelu estimated intake są delegowane do VildaEstimatedIntakeInputModel; DOM mount wyników jest delegowany do VildaEstimatedIntakeDomMount, a app.js zachowuje orkiestrację, JSON/autosave i advanced growth ↔ estimated intake sync',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_estimated_intake_input_model.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_estimated_intake.js', 'vilda_estimated_intake_runtime.js', 'vilda_estimated_intake_input_model.js', 'vilda_estimated_intake_dom_mount.js', 'app.js']
    });



    defineModuleDeps('estimated-intake-dom-mount', [
      { path: 'VildaEstimatedIntakeDomMount', type: 'object', source: 'vilda_estimated_intake_dom_mount.js 8Q-9 API', script: 'vilda_estimated_intake_dom_mount.js' },
      { path: 'VildaEstimatedIntakeDomMount.getEstimatedIntakeCalcOutputTargets', type: 'function', source: 'vilda_estimated_intake_dom_mount.js DOM target resolver', script: 'vilda_estimated_intake_dom_mount.js' },
      { path: 'VildaEstimatedIntakeDomMount.describeEstimatedIntakeCalcTargets', type: 'function', source: 'vilda_estimated_intake_dom_mount.js DOM target descriptor', script: 'vilda_estimated_intake_dom_mount.js' },
      { path: 'VildaEstimatedIntakeDomMount.getEstimatedIntakeCalcBranch', type: 'function', source: 'vilda_estimated_intake_dom_mount.js branch selector', script: 'vilda_estimated_intake_dom_mount.js' },
      { path: 'VildaEstimatedIntakeDomMount.applyEstimatedIntakeResultsRenderModel', type: 'function', source: 'vilda_estimated_intake_dom_mount.js renderModel DOM mount', script: 'vilda_estimated_intake_dom_mount.js' },
      { path: 'VildaEstimatedIntakeDomMount.hideEstimatedIntakeLegend', type: 'function', source: 'vilda_estimated_intake_dom_mount.js legend visibility adapter', script: 'vilda_estimated_intake_dom_mount.js' },
      { path: 'VildaEstimatedIntakeDomMount.getSnapshot', type: 'function', source: 'vilda_estimated_intake_dom_mount.js read-only snapshot', script: 'vilda_estimated_intake_dom_mount.js' },
      { path: 'vildaGetEstimatedIntakeDomMountSnapshot', type: 'function', source: 'vilda_estimated_intake_dom_mount.js global snapshot alias', script: 'vilda_estimated_intake_dom_mount.js' },
      { path: 'getVildaEstimatedIntakeDomMountAdapter', type: 'function', source: 'app.js DOM mount adapter wrapper 8Q-9', script: 'app.js' },
      { path: 'getVildaEstimatedIntakeDomMountDependencies', type: 'function', source: 'app.js DOM mount dependency bridge 8Q-9', script: 'app.js' },
      { path: 'getEstimatedIntakeCalcOutputTargets', type: 'function', source: 'app.js wrapper delegujący do DOM mount 8Q-9', script: 'app.js' },
      { path: 'describeEstimatedIntakeCalcTargets', type: 'function', source: 'app.js wrapper delegujący do DOM mount 8Q-9', script: 'app.js' },
      { path: 'getEstimatedIntakeCalcBranch', type: 'function', source: 'app.js wrapper delegujący do DOM mount 8Q-9', script: 'app.js' },
      { path: 'applyEstimatedIntakeResultsRenderModel', type: 'function', source: 'app.js wrapper delegujący do DOM mount 8Q-9', script: 'app.js' },
      { path: 'hideEstimatedIntakeLegend', type: 'function', source: 'app.js wrapper delegujący do DOM mount 8Q-9', script: 'app.js' }
    ], {
      description: '8Q-9: pobieranie targetów #intakeResults/#intakeLegend, opis targetów, wybór gałęzi i kontrolowany mount renderModel.html estimated intake są delegowane do VildaEstimatedIntakeDomMount; app.js zachowuje orkiestrację i fallbacki kompatybilnościowe',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_estimated_intake_dom_mount.js/app.js',
      loadAfter: ['vilda_deps.js', 'vilda_estimated_intake_ui.js', 'vilda_estimated_intake_input_model.js', 'vilda_estimated_intake_dom_mount.js', 'app.js']
    });

    defineModuleDeps('growth-reference-data', [
      { path: 'VildaGrowthReferenceData', type: 'object', source: 'vilda_growth_reference_data.js 8Q-1 data-only API', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.getData', type: 'function', source: 'vilda_growth_reference_data.js 8Q-1 data-only API', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.getSnapshot', type: 'function', source: 'vilda_growth_reference_data.js 8Q-1 read-only snapshot', script: 'vilda_growth_reference_data.js' },
      { path: 'vildaGetGrowthReferenceDataSnapshot', type: 'function', source: 'vilda_growth_reference_data.js 8Q-1 global snapshot alias', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.WFL_DATA_GIRLS', type: 'array', source: 'vilda_growth_reference_data.js WHO WFL girls LMS data', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.WFL_DATA_BOYS', type: 'array', source: 'vilda_growth_reference_data.js WHO WFL boys LMS data', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.bmiPercentiles', type: 'object', source: 'vilda_growth_reference_data.js pediatric BMI percentiles', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.LMS_BOYS', type: 'object', source: 'vilda_growth_reference_data.js BMI LMS boys', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.LMS_GIRLS', type: 'object', source: 'vilda_growth_reference_data.js BMI LMS girls', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.LMS_INFANT_BOYS', type: 'object', source: 'vilda_growth_reference_data.js infant BMI LMS boys', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.LMS_INFANT_GIRLS', type: 'object', source: 'vilda_growth_reference_data.js infant BMI LMS girls', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.bmiInfantBoys', type: 'object', source: 'vilda_growth_reference_data.js infant BMI percentiles boys', script: 'vilda_growth_reference_data.js' },
      { path: 'VildaGrowthReferenceData.bmiInfantGirls', type: 'object', source: 'vilda_growth_reference_data.js infant BMI percentiles girls', script: 'vilda_growth_reference_data.js' }
    ], {
      description: '8Q-1: statyczne dane referencyjne BMI/LMS/WHO-WFL wydzielone z app.js bez zmiany wartości danych ani algorytmów klinicznych',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_growth_reference_data.js',
      loadAfter: ['vilda_deps.js', 'vilda_growth_reference_data.js']
    });

    defineModuleDeps('professional-module', [
      { path: 'VildaProfessionalModule', type: 'object', source: 'vilda_professional_module.js 8Q-2 API', script: 'vilda_professional_module.js' },
      { path: 'VildaProfessionalModule.init', type: 'function', source: 'vilda_professional_module.js init bridge target', script: 'vilda_professional_module.js' },
      { path: 'VildaProfessionalModule.initProfessionalModule', type: 'function', source: 'vilda_professional_module.js legacy-named init alias', script: 'vilda_professional_module.js' },
      { path: 'VildaProfessionalModule.getSnapshot', type: 'function', source: 'vilda_professional_module.js read-only snapshot', script: 'vilda_professional_module.js' },
      { path: 'vildaGetProfessionalModuleSnapshot', type: 'function', source: 'vilda_professional_module.js global snapshot alias', script: 'vilda_professional_module.js' }
    ], {
      description: '8Q-2: logika modułu profesjonalnego, walidacja PWZ, helpery localStorage oraz UI potwierdzeń wydzielone z app.js bez zmiany obliczeń testów',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_professional_module.js',
      loadAfter: ['vilda_deps.js', 'vilda_professional_module.js']
    });

    defineModuleDeps('persist-runtime', [
      { path: 'VildaPersistRuntime', type: 'object', source: 'vilda_persist_runtime.js 8Q-3 API', script: 'vilda_persist_runtime.js' },
      { path: 'VildaPersistRuntime.init', type: 'function', source: 'vilda_persist_runtime.js init bridge target', script: 'vilda_persist_runtime.js' },
      { path: 'VildaPersistRuntime.initPersistRuntime', type: 'function', source: 'vilda_persist_runtime.js legacy-named init alias', script: 'vilda_persist_runtime.js' },
      { path: 'VildaPersistRuntime.getSnapshot', type: 'function', source: 'vilda_persist_runtime.js read-only snapshot', script: 'vilda_persist_runtime.js' },
      { path: 'vildaGetPersistRuntimeSnapshot', type: 'function', source: 'vilda_persist_runtime.js global snapshot alias', script: 'vilda_persist_runtime.js' },
      { path: 'vildaGetPersistAutosaveCoalescingSnapshot', type: 'function', source: 'vilda_persist_runtime.js autosave coalescing snapshot alias after init', script: 'vilda_persist_runtime.js' }
    ], {
      description: '8Q-3: PERSIST_* constants, autosave/coalescing runtime, capturePersistGlobals(), restoreAll(), updatePersistFromElement() oraz snapshoty diagnostyczne wydzielone z app.js bez zmiany schematu storage',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_persist_runtime.js',
      loadAfter: ['vilda_deps.js', 'vilda_persist_runtime.js', 'app.js']
    });

    defineModuleDeps('summary-cards', [
      { path: 'VildaSummaryCards', type: 'object', source: 'vilda_summary_cards.js 8Q-4 API', script: 'vilda_summary_cards.js' },
      { path: 'VildaSummaryCards.init', type: 'function', source: 'vilda_summary_cards.js init bridge target', script: 'vilda_summary_cards.js' },
      { path: 'VildaSummaryCards.initSummaryCards', type: 'function', source: 'vilda_summary_cards.js legacy-named init alias', script: 'vilda_summary_cards.js' },
      { path: 'VildaSummaryCards.getSnapshot', type: 'function', source: 'vilda_summary_cards.js read-only snapshot', script: 'vilda_summary_cards.js' },
      { path: 'vildaGetSummaryCardsSnapshot', type: 'function', source: 'vilda_summary_cards.js global snapshot alias', script: 'vilda_summary_cards.js' },
      { path: 'generateMetabolicSummary', type: 'function', source: 'vilda_summary_cards.js metabolic summary legacy alias', script: 'vilda_summary_cards.js' },
      { path: 'handleMetabolicSummaryClick', type: 'function', source: 'vilda_summary_cards.js metabolic summary click legacy alias', script: 'vilda_summary_cards.js' },
      { path: '__renderPrevSummary', type: 'function', source: 'vilda_summary_cards.js previous BMI summary legacy alias', script: 'vilda_summary_cards.js' },
      { path: '__renderPrevClcrSummary', type: 'function', source: 'vilda_summary_cards.js previous CLCR summary legacy alias', script: 'vilda_summary_cards.js' },
      { path: 'repositionDoctor', type: 'function', source: 'vilda_summary_cards.js doctor card layout legacy alias', script: 'vilda_summary_cards.js' },
      { path: 'repositionMetabolicSummary', type: 'function', source: 'vilda_summary_cards.js metabolic summary layout legacy alias', script: 'vilda_summary_cards.js' }
    ], {
      description: '8Q-4: generateMetabolicSummary(), handleMetabolicSummaryClick(), poprzednie pomiary i layout kart podsumowań wydzielone z app.js bez zmiany obliczeń ani zapisów storage',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_summary_cards.js',
      loadAfter: ['vilda_deps.js', 'vilda_summary_cards.js', 'app.js']
    });

    defineModuleDeps('diet-plan-ui', [
      { path: 'VildaDietPlanUI', type: 'object', source: 'vilda_diet_plan_ui.js 8Q-5 API', script: 'vilda_diet_plan_ui.js' },
      { path: 'VildaDietPlanUI.init', type: 'function', source: 'vilda_diet_plan_ui.js init bridge target', script: 'vilda_diet_plan_ui.js' },
      { path: 'VildaDietPlanUI.initDietPlanUI', type: 'function', source: 'vilda_diet_plan_ui.js legacy-named init alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'VildaDietPlanUI.getSnapshot', type: 'function', source: 'vilda_diet_plan_ui.js read-only snapshot', script: 'vilda_diet_plan_ui.js' },
      { path: 'vildaGetDietPlanUiSnapshot', type: 'function', source: 'vilda_diet_plan_ui.js global snapshot alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'updatePlanFromDiet', type: 'function', source: 'vilda_diet_plan_ui.js diet plan renderer legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'fillDietSelect', type: 'function', source: 'vilda_diet_plan_ui.js diet select renderer legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'updateDietDescription', type: 'function', source: 'vilda_diet_plan_ui.js diet description legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'updatePalDescription', type: 'function', source: 'vilda_diet_plan_ui.js PAL description legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'BMR', type: 'function', source: 'vilda_diet_plan_ui.js BMR/REE legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'energyBuildContext', type: 'function', source: 'vilda_diet_plan_ui.js energy model legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'energyBuildPlanReductionState', type: 'function', source: 'vilda_diet_plan_ui.js plan reduction state legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'energyBuildIntakeObservedState', type: 'function', source: 'vilda_diet_plan_ui.js intake observed state legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'energyPopulatePlanPalSelect', type: 'function', source: 'vilda_diet_plan_ui.js plan PAL select legacy alias', script: 'vilda_diet_plan_ui.js' },
      { path: 'energyPopulateIntakePalSelect', type: 'function', source: 'vilda_diet_plan_ui.js intake PAL select legacy alias', script: 'vilda_diet_plan_ui.js' }
    ], {
      description: '8Q-5: updatePlanFromDiet(), fillDietSelect(), BMR(), PAL i model energy/plan reduction wydzielone z app.js bez zmiany wzorów ani estimated intake',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_diet_plan_ui.js',
      loadAfter: ['vilda_deps.js', 'vilda_diet_plan_ui.js', 'app.js']
    });

    defineModuleDeps('pediatric-bmi-no-adult-fallback', [
      { path: 'bmiCategoryChild', type: 'function', source: 'app.js pediatric BMI classifier', script: 'app.js' },
      { path: 'bmiPercentileChild', type: 'function', source: 'app.js pediatric BMI percentile', script: 'app.js' },
      { path: 'vildaGetPediatricBmiClassificationUnavailableLabel', type: 'function', source: 'app.js 8O-10b unavailable label', script: 'app.js' },
      { path: 'vildaIsPediatricBmiCategoryUnavailable', type: 'function', source: 'app.js 8O-10b unavailable guard', script: 'app.js' },
      { path: 'vildaResolvePediatricBmiCategoryFromPercentile', type: 'function', source: 'app.js 8O-10b percentile classifier', script: 'app.js' },
      { path: 'vildaGetPediatricBmiClassificationAuditSnapshot', type: 'function', source: 'app.js 8O-10b read-only audit', script: 'app.js' },
      { path: 'VildaUpdatePrep.getPediatricBmiClassificationSnapshot', type: 'function', source: 'vilda_update_prep.js 8O-10b audit', script: 'vilda_update_prep.js' },
      { path: 'VildaUpdatePrep.isPediatricBmiClassificationUnavailable', type: 'function', source: 'vilda_update_prep.js 8O-10b guard', script: 'vilda_update_prep.js' }
    ], {
      description: '8O-10b: dzieci bez dostępnego percentyla BMI nie są klasyfikowane progami dorosłych; aplikacja zwraca jawny stan braku klasyfikacji pediatrycznej',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'app.js/vilda_update_prep.js',
      loadAfter: ['vilda_deps.js', 'vilda_update_prep.js', 'app.js']
    });

    defineModuleDeps('numeric-validation-age-zero', [
      { path: 'vildaIsFinitePositive', type: 'function', source: 'app.js numeric validation helper', script: 'app.js' },
      { path: 'vildaIsFiniteNonNegative', type: 'function', source: 'app.js numeric validation helper', script: 'app.js' },
      { path: 'vildaReadNumericInputState', type: 'function', source: 'app.js numeric input reader', script: 'app.js' },
      { path: 'vildaGetMainAgeInputState', type: 'function', source: 'app.js age input state reader', script: 'app.js' },
      { path: 'vildaGetMainAnthroValidationSnapshot', type: 'function', source: 'app.js anthro validation snapshot', script: 'app.js' },
      { path: 'vildaGetNumericValidationAuditSnapshot', type: 'function', source: 'app.js numeric validation audit', script: 'app.js' },
      { path: 'VildaUpdatePrep.getNumericValidationSnapshot', type: 'function', source: 'vilda_update_prep.js numeric validation audit', script: 'vilda_update_prep.js' },
      { path: 'VildaUpdatePrep.isFinitePositive', type: 'function', source: 'vilda_update_prep.js numeric helper', script: 'vilda_update_prep.js' },
      { path: 'VildaUpdatePrep.isFiniteNonNegative', type: 'function', source: 'vilda_update_prep.js numeric helper', script: 'vilda_update_prep.js' },
      { path: 'VildaDataImportExport.version', type: 'string', source: 'vilda_data_import_export.js version marker', script: 'vilda_data_import_export.js' }
    ], {
      description: '8O-10a: jawna walidacja liczbowa; age=0 jest akceptowane tylko jako jawnie wpisana wartość, a puste pole wieku nie jest traktowane jak noworodek',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'app.js/vilda_update_prep.js/vilda_data_import_export.js',
      loadAfter: ['vilda_deps.js', 'vilda_data_import_export.js', 'vilda_update_prep.js', 'app.js']
    });

    defineModuleDeps('nutrition-norms-refresh-queue', [
      { path: 'VildaFoodSummary', type: 'object', source: 'vilda_food_summary.js', script: 'vilda_food_summary.js' },
      { path: 'VildaFoodSummary.getNutritionNormsRefreshQueueSnapshot', type: 'function', source: 'vilda_food_summary.js 8O-10c queue audit', script: 'vilda_food_summary.js' },
      { path: 'VildaFoodSummary.buildNutritionNormsRefreshSignature', type: 'function', source: 'vilda_food_summary.js signature helper', script: 'vilda_food_summary.js' },
      { path: 'macroPracticeInitNutritionNormsRefresh', type: 'function', source: 'vilda_food_summary.js nutrition norms event binding', script: 'vilda_food_summary.js' },
      { path: 'macroPracticeRefreshFoodCardOnly', type: 'function', source: 'vilda_food_summary.js local refresh', script: 'vilda_food_summary.js' },
      { path: 'macroPracticeGetNutritionNormsRefreshQueueSnapshot', type: 'function', source: 'vilda_food_summary.js global audit alias', script: 'vilda_food_summary.js' },
      { path: 'vildaGetNutritionNormsRefreshQueueSnapshot', type: 'function', source: 'vilda_food_summary.js global audit alias', script: 'vilda_food_summary.js' },
      { path: 'macroPracticeBuildNutritionNormsRefreshSignature', type: 'function', source: 'vilda_food_summary.js global signature helper', script: 'vilda_food_summary.js' }
    ], {
      description: '8O-10c: nutritionNormsModelUpdated nie gubi szybkiego, odmiennego zdarzenia podczas trwającego refreshu food-summary; pending signature jest wykonywany po zakończeniu bieżącego refreshu, bez zmian obliczeń norm',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_food_summary.js',
      loadAfter: ['vilda_deps.js', 'vilda_food_summary.js']
    });


    defineModuleDeps('update-hooks-registry', [
      { path: 'VildaUpdateHooks', type: 'object', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.registerAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.unregisterAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.runAfterUpdateHooks', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getSnapshot', type: 'function', source: 'vilda_update_hooks.js read-only audit', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getHookAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js read-only audit alias', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getFinalUpdateChainAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js 8O-10d-e final chain audit', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getApiSurfaceStatus', type: 'function', source: 'vilda_update_hooks.js API audit', script: 'vilda_update_hooks.js' },
      { path: 'vildaRegisterAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js global alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaUnregisterAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js global alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaRunAfterUpdateHooks', type: 'function', source: 'vilda_update_hooks.js global alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksSnapshot', type: 'function', source: 'vilda_update_hooks.js global alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js global audit alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetFinalUpdateChainAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js global final audit alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksFinalChainAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js global final audit alias', script: 'vilda_update_hooks.js' }
    ], {
      description: '8O-10d-a: przygotowawcze registry hooków po update(); moduł nie przepina window.update, nie zmienia kolejności istniejących wrapperów i udostępnia read-only snapshot migracyjny',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_update_hooks.js',
      loadAfter: ['vilda_deps.js', 'vilda_update_hooks.js']
    });


    defineModuleDeps('update-hooks-first-wrapper-bridge', [
      { path: 'VildaUpdateHooks', type: 'object', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.registerAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.runAfterUpdateHooks', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getSnapshot', type: 'function', source: 'vilda_update_hooks.js bridge-aware snapshot', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksBridgeSnapshot', type: 'function', source: 'app.js 8O-10d-c bridge audit', script: 'app.js' },
      { path: '__vildaUpdateHooksBridge8O10dB', type: 'function', source: 'app.js bridge function kept for compatibility', script: 'app.js' }
    ], {
      description: '8O-10d-b/c: pierwszy pojedynczy wrapper window.update z app.js (BMI p50 info) pozostaje przepięty na VildaUpdateHooks; app.js instaluje bridge, a drugi hook jest dodany w 8O-10d-c',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'app.js/vilda_update_hooks.js',
      loadAfter: ['vilda_deps.js', 'vilda_update_hooks.js', 'app.js']
    });


    defineModuleDeps('update-hooks-second-wrapper-bridge', [
      { path: 'VildaUpdateHooks', type: 'object', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.registerAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.runAfterUpdateHooks', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getSnapshot', type: 'function', source: 'vilda_update_hooks.js bridge-aware snapshot', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksBridgeSnapshot', type: 'function', source: 'app.js 8O-10d-d bridge audit', script: 'app.js' },
      { path: '__vildaUpdateHooksBridge8O10dC', type: 'function', source: 'app.js 8O-10d-c bridge alias', script: 'app.js' },
      { path: '__vildaUpdateHooksBridge8O10dD', type: 'function', source: 'app.js 8O-10d-d bridge alias', script: 'app.js' },
      { path: '__vildaIdealWeightUIAfterUpdateHookId', type: 'string', source: 'app.js ideal weight hook id', script: 'app.js' },
      { path: '__vildaIdealWeightUIAfterUpdateHookRegistered', type: 'boolean', source: 'app.js ideal weight hook registration flag', script: 'app.js' },
      { path: '__vildaIdealWeightUIAfterUpdateFallback', type: 'function', source: 'app.js ideal weight hook fallback', script: 'app.js' }
    ], {
      description: '8O-10d-c/d: drugi wrapper app.js window.update (updateIdealWeightUI) pozostaje przepięty na VildaUpdateHooks jako hook o kolejności po BMI p50; bridge ma alias 8O-10d-d dla kolejnego etapu migracji',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'app.js/vilda_update_hooks.js',
      loadAfter: ['vilda_deps.js', 'vilda_update_hooks.js', 'app.js']
    });


    defineModuleDeps('update-hooks-diet-recommendations-wrapper', [
      { path: 'VildaUpdateHooks', type: 'object', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.registerAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.runAfterUpdateHooks', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getSnapshot', type: 'function', source: 'vilda_update_hooks.js bridge-aware snapshot', script: 'vilda_update_hooks.js' },
      { path: 'VildaDietRecommendations', type: 'object', source: 'vilda_diet_recommendations.js', script: 'vilda_diet_recommendations.js' },
      { path: 'VildaDietRecommendations.updateVisibilityAfterUpdate', type: 'function', source: 'vilda_diet_recommendations.js migrated hook', script: 'vilda_diet_recommendations.js' },
      { path: 'VildaDietRecommendations.getUpdateHookSnapshot', type: 'function', source: 'vilda_diet_recommendations.js read-only audit', script: 'vilda_diet_recommendations.js' },
      { path: 'vildaGetDietRecommendationsUpdateHookSnapshot', type: 'function', source: 'vilda_diet_recommendations.js global audit alias', script: 'vilda_diet_recommendations.js' },
      { path: '__vildaDietRecommendationsAfterUpdateHookId', type: 'string', source: 'vilda_diet_recommendations.js hook id', script: 'vilda_diet_recommendations.js' },
      { path: '__vildaDietRecommendationsAfterUpdateHookRegistered', type: 'boolean', source: 'vilda_diet_recommendations.js registration flag', script: 'vilda_diet_recommendations.js' },
      { path: '__vildaDietRecommendationsVisibilityAfterUpdateFallback', type: 'function', source: 'vilda_diet_recommendations.js hook fallback', script: 'vilda_diet_recommendations.js' }
    ], {
      description: '8O-10d-d: wrapper window.update z vilda_diet_recommendations.js został przepięty na VildaUpdateHooks jako hook widoczności zaleceń dietetycznych wykonywany po hookach app.js; bez zmiany logiki zaleceń',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_diet_recommendations.js/vilda_update_hooks.js',
      loadAfter: ['vilda_deps.js', 'vilda_update_hooks.js', 'app.js', 'vilda_diet_recommendations.js', 'nutrition_norms.js', 'nutrition_micros.js']
    });


    defineModuleDeps('update-hooks-nutrition-norms-wrapper', [
      { path: 'VildaUpdateHooks', type: 'object', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.registerAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getSnapshot', type: 'function', source: 'vilda_update_hooks.js bridge-aware snapshot', script: 'vilda_update_hooks.js' },
      { path: 'VildaNutritionNorms', type: 'object', source: 'nutrition_norms.js', script: 'nutrition_norms.js' },
      { path: 'VildaNutritionNorms.getUpdateHookSnapshot', type: 'function', source: 'nutrition_norms.js module audit', script: 'nutrition_norms.js' },
      { path: 'VildaNutritionNorms.renderAfterUpdate', type: 'function', source: 'nutrition_norms.js module hook callback', script: 'nutrition_norms.js' },
      { path: 'nutritionNormsRenderAfterUpdate', type: 'function', source: 'nutrition_norms.js hook callback', script: 'nutrition_norms.js' },
      { path: 'nutritionNormsRegisterAfterUpdateHook', type: 'function', source: 'nutrition_norms.js hook registration', script: 'nutrition_norms.js' },
      { path: 'nutritionNormsGetUpdateHookSnapshot', type: 'function', source: 'nutrition_norms.js read-only audit', script: 'nutrition_norms.js' },
      { path: 'vildaGetNutritionNormsUpdateHookSnapshot', type: 'function', source: 'nutrition_norms.js global audit alias', script: 'nutrition_norms.js' },
      { path: '__vildaNutritionNormsAfterUpdateHookId', type: 'string', source: 'nutrition_norms.js hook id', script: 'nutrition_norms.js' },
      { path: '__vildaNutritionNormsAfterUpdateHookRegistered', type: 'boolean', source: 'nutrition_norms.js hook registered flag', script: 'nutrition_norms.js' },
      { path: '__vildaNutritionNormsAfterUpdateFallback', type: 'function', source: 'nutrition_norms.js hook fallback', script: 'nutrition_norms.js' }
    ], {
      description: '8O-10d-f: wrapper window.update z nutrition_norms.js został przepięty na VildaUpdateHooks jako hook renderowania karty norm, wykonywany po hookach app.js i diet recommendations oraz przed docelowym hookiem nutrition_micros.js; bez zmiany obliczeń norm',
      pages: ['index.html'],
      script: 'nutrition_norms.js/vilda_update_hooks.js',
      loadAfter: ['vilda_deps.js', 'vilda_update_hooks.js', 'app.js', 'vilda_diet_recommendations.js', 'nutrition_norms.js']
    });


    defineModuleDeps('update-hooks-nutrition-micros-wrapper', [
      { path: 'VildaUpdateHooks', type: 'object', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.registerAfterUpdateHook', type: 'function', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getSnapshot', type: 'function', source: 'vilda_update_hooks.js bridge-aware snapshot', script: 'vilda_update_hooks.js' },
      { path: 'VildaNutritionMicros', type: 'object', source: 'nutrition_micros.js', script: 'nutrition_micros.js' },
      { path: 'VildaNutritionMicros.getUpdateHookSnapshot', type: 'function', source: 'nutrition_micros.js module audit', script: 'nutrition_micros.js' },
      { path: 'VildaNutritionMicros.getDirectRenderCoalescingSnapshot', type: 'function', source: 'nutrition_micros.js 8P-12 direct render coalescing audit', script: 'nutrition_micros.js' },
      { path: 'VildaNutritionMicros.getProfileRenderCoalescingSnapshot', type: 'function', source: 'nutrition_micros.js 8P-13 profile field render coalescing audit', script: 'nutrition_micros.js' },
      { path: 'VildaNutritionMicros.getBootstrapRenderCoalescingSnapshot', type: 'function', source: 'nutrition_micros.js 8P-14 bootstrap render coalescing audit', script: 'nutrition_micros.js' },
      { path: 'VildaNutritionMicros.renderAfterUpdate', type: 'function', source: 'nutrition_micros.js module hook callback', script: 'nutrition_micros.js' },
      { path: 'nutritionMicrosRenderAfterUpdate', type: 'function', source: 'nutrition_micros.js hook callback', script: 'nutrition_micros.js' },
      { path: 'nutritionMicrosRegisterAfterUpdateHook', type: 'function', source: 'nutrition_micros.js hook registration', script: 'nutrition_micros.js' },
      { path: 'nutritionMicrosGetUpdateHookSnapshot', type: 'function', source: 'nutrition_micros.js read-only audit', script: 'nutrition_micros.js' },
      { path: 'vildaGetNutritionMicrosUpdateHookSnapshot', type: 'function', source: 'nutrition_micros.js global audit alias', script: 'nutrition_micros.js' },
      { path: 'vildaGetNutritionMicrosDirectRenderCoalescingSnapshot', type: 'function', source: 'nutrition_micros.js 8P-12 direct render global audit alias', script: 'nutrition_micros.js' },
      { path: 'vildaGetNutritionMicrosProfileRenderCoalescingSnapshot', type: 'function', source: 'nutrition_micros.js 8P-13 profile field render global audit alias', script: 'nutrition_micros.js' },
      { path: 'vildaGetNutritionMicrosBootstrapRenderCoalescingSnapshot', type: 'function', source: 'nutrition_micros.js 8P-14 bootstrap render global audit alias', script: 'nutrition_micros.js' },
      { path: '__vildaNutritionMicrosAfterUpdateHookId', type: 'string', source: 'nutrition_micros.js hook id', script: 'nutrition_micros.js' },
      { path: '__vildaNutritionMicrosAfterUpdateHookRegistered', type: 'boolean', source: 'nutrition_micros.js hook registered flag', script: 'nutrition_micros.js' },
      { path: '__vildaNutritionMicrosAfterUpdateFallback', type: 'function', source: 'nutrition_micros.js hook fallback', script: 'nutrition_micros.js' }
    ], {
      description: '8P-14: wrapper window.update z nutrition_micros.js pozostaje przepięty na VildaUpdateHooks, a bezpośrednie rendery UI, szybkie input/change pól profilu oraz bootstrap mają read-only audyt rAF-koalescencji; bez zmiany obliczeń mikroelementów',
      pages: ['index.html'],
      script: 'nutrition_micros.js/vilda_update_hooks.js',
      loadAfter: ['vilda_deps.js', 'vilda_update_hooks.js', 'app.js', 'vilda_diet_recommendations.js', 'nutrition_norms.js', 'nutrition_micros.js']
    });


    defineModuleDeps('update-hooks-final-chain-audit', [
      { path: 'VildaUpdateHooks', type: 'object', source: 'vilda_update_hooks.js', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getSnapshot', type: 'function', source: 'vilda_update_hooks.js bridge-aware snapshot', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getFinalUpdateChainAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js final chain audit', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetFinalUpdateChainAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js global final audit alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksFinalChainAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js global final audit alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksBridgeSnapshot', type: 'function', source: 'app.js bridge audit', script: 'app.js' },
      { path: '__vildaUpdateHooksBridge8O10dE', type: 'function', source: 'app.js 8O-10d-e bridge alias', script: 'app.js' },
      { path: '__vildaUpdateHooksBridge8O10dF', type: 'function', source: 'app.js 8O-10d-f bridge alias', script: 'app.js' },
      { path: '__vildaUpdateHooksBridge8O10dG', type: 'function', source: 'app.js 8O-10d-g bridge alias', script: 'app.js' }
    ], {
      description: '8O-10d-g: końcowy, read-only audyt łańcucha window.update potwierdza migrację znanych wrapperów 8O-10d oraz nutrition_norms.js/nutrition_micros.js, kolejność hooków 10/20/30/40/50 i brak znanych legacy-wrapperów update w tym torze',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_update_hooks.js/app.js/nutrition_micros.js',
      loadAfter: ['vilda_deps.js', 'vilda_update_hooks.js', 'app.js', 'vilda_diet_recommendations.js', 'nutrition_norms.js', 'nutrition_micros.js']
    });


    defineModuleDeps('centile-chart-header-fresh-name', [
      { path: 'VildaCentileChartHeader', type: 'object', source: 'vilda_centile_chart_header.js', script: 'vilda_centile_chart_header.js' },
      { path: 'VildaCentileChartHeader.buildHeaderNameState', type: 'function', source: 'vilda_centile_chart_header.js fresh DOM priority', script: 'vilda_centile_chart_header.js' },
      { path: 'VildaCentileChartHeader.buildNameLabel', type: 'function', source: 'vilda_centile_chart_header.js PDF label helper', script: 'vilda_centile_chart_header.js' },
      { path: 'VildaCentileChartHeader.getSnapshot', type: 'function', source: 'vilda_centile_chart_header.js read-only audit', script: 'vilda_centile_chart_header.js' },
      { path: 'VildaCentileChartHeader.markNameInputEdit', type: 'function', source: 'vilda_centile_chart_header.js last edited input tracking', script: 'vilda_centile_chart_header.js' },
      { path: 'vildaGetCentileChartHeaderNameSnapshot', type: 'function', source: 'vilda_centile_chart_header.js global audit alias', script: 'vilda_centile_chart_header.js' },
      { path: 'vildaGetCentileChartHeaderNameState', type: 'function', source: 'vilda_centile_chart_header.js global state alias', script: 'vilda_centile_chart_header.js' },
      { path: 'vildaBuildCentileChartNameLabel', type: 'function', source: 'vilda_centile_chart_header.js global label alias', script: 'vilda_centile_chart_header.js' },
      { path: 'getCentileChartHeaderNameState', type: 'function', source: 'index.html/docpro.html delegator or module fallback', script: 'index.html/docpro.html/vilda_centile_chart_header.js' },
      { path: 'buildCentileChartNameLabel', type: 'function', source: 'index.html/docpro.html delegator or module fallback', script: 'index.html/docpro.html/vilda_centile_chart_header.js' }
    ], {
      description: '8O-10e: PDF siatek centylowych preferuje aktualne pola DOM (#advName/#basicGrowthName/#name) oraz ostatnio edytowane pole przed potencjalnie nieświeżym window.advancedGrowthData.name; bez zmian obliczeń wzrostowych',
      pages: ['index.html', 'docpro.html'],
      script: 'vilda_centile_chart_header.js/index.html/docpro.html',
      loadAfter: ['vilda_deps.js', 'vilda_centile_chart_header.js']
    });

    defineModuleDeps('regression-smoke-suite', [
      // PERF: vilda_smoke_tests.js (kod testowy) usunięty z bundla produkcyjnego —
      // 6 kontraktów VildaSmokeTests/aliasy zdjęte, bo moduł nie jest już ładowany
      // w przeglądarce. Suite regresyjny uruchamiamy w Node (tools/), nie u użytkownika.
      { path: 'VildaEstimatedIntake.buildEstimatedIntakeCalculationModel', type: 'function', source: 'vilda_estimated_intake.js pure model', script: 'vilda_estimated_intake.js' },
      { path: 'vildaGetEstimatedIntakeAuditSnapshot', type: 'function', source: 'app.js estimated intake audit', script: 'app.js' },
      { path: 'vildaGetEstimatedIntakeCalcSeamSnapshot', type: 'function', source: 'app.js calc seam audit', script: 'app.js' },
      { path: 'vildaGetEstimatedIntakeCalculationModelSnapshot', type: 'function', source: 'app.js calculation model audit', script: 'app.js' },
      { path: 'vildaGetAdvancedIntakeSyncAuditSnapshot', type: 'function', source: 'app.js advanced-intake sync audit', script: 'app.js', required: false },
      { path: 'VildaDeps.checkModuleDeps', type: 'function', source: 'vilda_deps.js', script: 'vilda_deps.js' },
      { path: 'VildaDeps.checkScriptOrder', type: 'function', source: 'vilda_deps.js', script: 'vilda_deps.js' },
      { path: 'vildaGetNutritionNormsRefreshQueueSnapshot', type: 'function', source: 'vilda_food_summary.js 8O-10c queue audit', script: 'vilda_food_summary.js' },
      { path: 'VildaUpdateHooks.getSnapshot', type: 'function', source: 'vilda_update_hooks.js 8O-10d-a registry audit', script: 'vilda_update_hooks.js' },
      { path: 'VildaUpdateHooks.getHookAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js 8O-10d-b registry audit alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksSnapshot', type: 'function', source: 'vilda_update_hooks.js global audit alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js global audit alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetUpdateHooksBridgeSnapshot', type: 'function', source: 'app.js 8O-10d-b bridge audit', script: 'app.js' },
      { path: 'vildaGetDietRecommendationsUpdateHookSnapshot', type: 'function', source: 'vilda_diet_recommendations.js 8O-10d-d update hook audit', script: 'vilda_diet_recommendations.js' },
      { path: 'VildaDietRecommendations.getUpdateHookSnapshot', type: 'function', source: 'vilda_diet_recommendations.js 8O-10d-d update hook audit', script: 'vilda_diet_recommendations.js' },
      { path: 'VildaUpdateHooks.getFinalUpdateChainAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js 8O-10d-g final chain audit', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetFinalUpdateChainAuditSnapshot', type: 'function', source: 'vilda_update_hooks.js 8O-10d-g global final audit alias', script: 'vilda_update_hooks.js' },
      { path: 'vildaGetNutritionNormsUpdateHookSnapshot', type: 'function', source: 'nutrition_norms.js 8O-10d-f update hook audit', script: 'nutrition_norms.js', required: false },
      { path: 'vildaGetNutritionMicrosUpdateHookSnapshot', type: 'function', source: 'nutrition_micros.js 8O-10d-g update hook audit', script: 'nutrition_micros.js', required: false },
      { path: 'VildaCentileChartHeader.buildHeaderNameState', type: 'function', source: 'vilda_centile_chart_header.js 8O-10e fresh DOM priority', script: 'vilda_centile_chart_header.js' },
      { path: 'vildaGetCentileChartHeaderNameSnapshot', type: 'function', source: 'vilda_centile_chart_header.js 8O-10e read-only audit', script: 'vilda_centile_chart_header.js' },
      { path: 'VildaGHTherapyResourceAudit.getSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11d close/onversionchange/broadcast/mutation/fetch resource audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetGHTherapyIndexedDbAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11d global alias', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaAppHelpers.fetchWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d fetch timeout helper', script: 'vilda_app_helpers.js' },
      { path: 'VildaAppHelpers.fetchJsonWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d JSON fetch helper', script: 'vilda_app_helpers.js' },
      { path: 'vildaFetchJsonWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d global JSON fetch helper alias', script: 'vilda_app_helpers.js' }
    ], {
      description: '8O-T1/8O-10a/8O-10b/8O-10c/8O-10d-a/8O-10e/8O-10d-b/8O-10d-c/8O-10d-d/8O-10d-e/8O-10d-f/8O-10d-g/8O-11a-a/8O-11a-b/8O-11a-c/8O-11b/8O-11c/8O-11d: stały, read-only zestaw smoke testów regresyjnych dla estimated intake, kontraktów VildaDeps, synchronizacji advanced ↔ intake, cache bustingu, walidacji age=0, pediatrycznego BMI bez fallbacku dorosłego i kolejki refreshy nutritionNormsModelUpdated, registry hooków update, świeżego imienia w nagłówku siatek centylowych, bridge window.update, hooka zaleceń dietetycznych, hooków nutrition norms/micros, końcowego audytu łańcucha update i audytu zasobów GH therapy oraz cleanupu db.close(), onversionchange, BroadcastChannel lifecycle, MutationObserver lifecycle/scope i fetch timeout cleanup; uruchamiany ręcznie przez window.vildaRunSmokeRegressionSuite()',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_smoke_tests.js',
      loadAfter: ['vilda_deps.js', 'vilda_app_helpers.js', 'vilda_update_hooks.js', 'vilda_centile_chart_header.js', 'vilda_gh_therapy_resource_audit.js', 'vilda_food_summary.js', 'vilda_estimated_intake.js', 'app.js', 'vilda_diet_recommendations.js', 'nutrition_norms.js', 'nutrition_micros.js', 'vilda_smoke_tests.js']
    });


    defineModuleDeps('advanced-growth-neutral-helpers', [
      { path: 'VildaAdvancedGrowth', type: 'object', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advHistoryEscapeHtml', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advHistoryFormatNumber', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advHistoryFormatAgeMonths', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advHistorySourceLabel', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advHistoryDecodeCentile', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advHistoryPercentileText', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advGrowthFormatSignedNumber', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advGrowthSanitizePdfText', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advGrowthSanitizePdfMultilineText', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'advGrowthHexToRgb', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.setupAdvancedGrowth', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.isAdvancedGrowthMainPage', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.isAdvancedGrowthProModeActive', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.addAdvMeasurementRow', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.updateAdvAgeMax', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.updateAdvancedMeasurementAnalysisControls', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.updateAdvancedGrowthAccess', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.getGrowthDataSourceAgeYears', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.isGrowthResultsProfessionalMode', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.normalizeGrowthDataSource', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.isGrowthDataSourceAllowed', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.getDefaultGrowthDataSource', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.setCheckedGrowthDataSource', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.rememberManualGrowthDataSource', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.refreshGrowthChartActionControls', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.syncGrowthDataSourceInputs', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.updatePalczewskaAccess', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.updateGrowthDataSourceControls', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.getGhAdvancedCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.ghAdvancedApproxEq', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.ghTherapyPointMatchesCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.ghAdvancedRowMatchesCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.calculateBayleyPinneauPrediction', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.calculateRWTPrediction', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.calculateReinehrCdgpPrediction', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advGrowthBuildPredictionReliabilityModel', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advGrowthBuildPredictionReliabilityHtml', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.buildBayleyPinneauResultHtml', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.buildRWTResultHtml', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.collectAdvancedGrowthCalculationInput', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.buildAdvancedGrowthDataPayload', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.commitAdvancedGrowthDataPayload', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.clearAdvancedGrowthDataPayload', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advGrowthBuildReportRows', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advGrowthBuildPdfMakeDefinition', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advGrowthBuildReportPresentationModel', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.advGrowthBuildHtmlReportMarkup', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.generateAdvancedGrowthPdfReport', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' }
    ], {
      description: 'Helpery formatowania, UI formularza, raport HTML/PDF, kontrola źródeł danych, mostek GH/IGF, silniki predykcyjne oraz adaptery calculateGrowthAdvanced()/lifecycle wydzielone/przygotowane w 8O-1–8O-7b',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_advanced_growth.js',
      loadAfter: ['vilda_html.js']
    });

    defineModuleDeps('advanced-growth-gh-igf-import-bridge', [
      { path: 'VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.getGhAdvancedCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.ghAdvancedApproxEq', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.ghTherapyPointMatchesCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'VildaAdvancedGrowth.ghAdvancedRowMatchesCurrentBasics', type: 'function', source: 'vilda_advanced_growth.js', script: 'vilda_advanced_growth.js' },
      { path: 'getTherapyPointsFromDB', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'readGhTherapyPointsFromModuleStorage', type: 'function', source: 'app.js', script: 'app.js', required: false },
      { path: 'writeGhTherapyPointsToModuleStorage', type: 'function', source: 'app.js', script: 'app.js', required: false }
    ], {
      description: 'Mostek importu punktów GH/IGF-1 do historii advanced growth wydzielony w 8O-5',
      pages: ['index.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'vilda_advanced_growth.js']
    });

    defineModuleDeps('gh-therapy-indexeddb-resource-audit', [
      { path: 'VildaGHTherapyResourceAudit', type: 'object', source: 'vilda_gh_therapy_resource_audit.js', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaGHTherapyResourceAudit.getSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js read-only snapshot', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaGHTherapyResourceAudit.getGHTherapyIndexedDbAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js IndexedDB alias', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaGHTherapyResourceAudit.getApiSurfaceStatus', type: 'function', source: 'vilda_gh_therapy_resource_audit.js API audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerFetchCacheStrategyAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js Service Worker cache strategy audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerStaleCachePruningAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11h Service Worker stale cache pruning audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerRuntimeCachePruningSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11i Service Worker runtime cache pruning audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerClientLifecycleAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11j client-side Service Worker lifecycle audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'VildaGHTherapyResourceAudit.getPwaManifestIconCacheSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11l PWA manifest/icon cache audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetGHTherapyIndexedDbAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js global alias', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetGHTherapyResourceAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js global alias', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      description: '8O-11l: read-only audyt stanu po domknięciu IDBDatabase, onversionchange, lifecycle cleanup BroadcastChannel, lifecycle/scope cleanup MutationObserver, fetch timeout cleanup, audycie strategii Service Workera, smoke E2E offline/update-flow, naprawie cache key wersjonowanych zasobów shell, runtime cache pruning, client-side lifecycle rejestracji/update-flow SW i manifest/icon cache PWA; bez otwierania bazy, bez wysyłania komunikatów, bez pobierania zasobów przez audyt, bez dotykania cache i bez zmian danych',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_gh_therapy_resource_audit.js',
      loadAfter: ['vilda_deps.js', 'vilda_gh_therapy_resource_audit.js']
    });

    defineModuleDeps('fetch-timeout-cleanup', [
      { path: 'VildaAppHelpers.fetchWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d generic fetch timeout helper', script: 'vilda_app_helpers.js' },
      { path: 'VildaAppHelpers.fetchJsonWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d JSON fetch timeout helper', script: 'vilda_app_helpers.js' },
      { path: 'VildaAppHelpers.fetchArrayBufferWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d arrayBuffer fetch timeout helper', script: 'vilda_app_helpers.js' },
      { path: 'VildaAppHelpers.fetchBlobWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d blob fetch timeout helper', script: 'vilda_app_helpers.js' },
      { path: 'vildaFetchWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d global fetch helper alias', script: 'vilda_app_helpers.js' },
      { path: 'vildaFetchJsonWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d global JSON fetch helper alias', script: 'vilda_app_helpers.js' },
      { path: 'vildaFetchArrayBufferWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d global arrayBuffer helper alias', script: 'vilda_app_helpers.js' },
      { path: 'vildaFetchBlobWithTimeout', type: 'function', source: 'vilda_app_helpers.js 8O-11d global blob helper alias', script: 'vilda_app_helpers.js' }
    ], {
      description: '8O-11d: helpery fetch*WithTimeout z AbortController, clearTimeout i rozróżnieniem timeout/HTTP/network/JSON parse; bez pobierania zasobów przez sam kontrakt',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_app_helpers.js',
      loadAfter: ['vilda_deps.js', 'vilda_app_helpers.js']
    });

    defineModuleDeps('service-worker-fetch-cache-strategy', [
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerFetchCacheStrategyAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11e Service Worker strategy audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetServiceWorkerFetchCacheStrategyAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11e Service Worker global alias', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      description: '8O-11e: read-only audyt strategii fetch/cache/offline Service Workera oraz timeout-exempt policy; bez rejestracji SW, bez fetch i bez dotykania cache',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_gh_therapy_resource_audit.js',
      loadAfter: ['vilda_deps.js', 'vilda_gh_therapy_resource_audit.js']
    });

    defineModuleDeps('service-worker-offline-update-flow-smoke', [
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerOfflineUpdateFlowSmokeSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11f Service Worker offline/update-flow smoke audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetServiceWorkerOfflineUpdateFlowSmokeSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11f Service Worker offline/update-flow global alias', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      description: '8O-11f: kontrolowany smoke E2E offline/update-flow Service Workera w mocku Cache API; bez realnej rejestracji SW, bez dotykania przeglądarkowego Cache API i bez zmian danych klinicznych',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_gh_therapy_resource_audit.js',
      loadAfter: ['vilda_deps.js', 'vilda_gh_therapy_resource_audit.js']
    });


    defineModuleDeps('service-worker-versioned-shell-cache-key', [
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerVersionedShellCacheKeySnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11g Service Worker versioned shell cache-key audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetServiceWorkerVersionedShellCacheKeySnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11g Service Worker versioned shell cache-key global alias', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      description: '8O-11g: spójny cache key pathname+search dla wersjonowanych zasobów shell w precache/install i fetch; bez rejestracji SW, bez realnego Cache API i bez zmian danych klinicznych',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_gh_therapy_resource_audit.js',
      loadAfter: ['vilda_deps.js', 'vilda_gh_therapy_resource_audit.js']
    });

    defineModuleDeps('service-worker-stale-cache-pruning-audit', [
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerStaleCachePruningAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11h Service Worker stale cache pruning audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetServiceWorkerStaleCachePruningAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11h Service Worker stale cache pruning global alias', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      description: '8O-11h: read-only audyt scope activate prune starych shell/runtime cache, migracji starych runtime cache i ryzyka wzrostu unversioned runtime cache; bez realnej rejestracji SW, bez dotykania Cache API i bez zmian danych klinicznych',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_gh_therapy_resource_audit.js',
      loadAfter: ['vilda_deps.js', 'vilda_gh_therapy_resource_audit.js']
    });

    defineModuleDeps('service-worker-runtime-cache-pruning', [
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerRuntimeCachePruningSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11i Service Worker runtime cache pruning audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetServiceWorkerRuntimeCachePruningSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11i Service Worker runtime cache pruning global alias', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      description: '8O-11i: TTL 30 dni, limit 96 wpisów i metadane runtime cache Service Workera; bez realnej rejestracji SW, bez dotykania przeglądarkowego Cache API i bez zmian danych klinicznych',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_gh_therapy_resource_audit.js',
      loadAfter: ['vilda_deps.js', 'vilda_gh_therapy_resource_audit.js']
    });

    defineModuleDeps('service-worker-client-lifecycle-audit', [
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerClientLifecycleAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11j client-side Service Worker lifecycle audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetServiceWorkerClientLifecycleAuditSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11j client-side Service Worker lifecycle global alias', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      description: '8O-11j: singleton registrationPromise, deduplikacja updatefound/statechange/waiting prompt, jednorazowy controllerchange reload i usunięcie legacy rejestracji SW z docpro.html; audyt nie rejestruje realnego SW i nie dotyka Cache API',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_gh_therapy_resource_audit.js',
      loadAfter: ['vilda_deps.js', 'vilda_gh_therapy_resource_audit.js']
    });


    defineModuleDeps('service-worker-client-update-ux-smoke', [
      { path: 'VildaGHTherapyResourceAudit.getServiceWorkerClientUpdateUxSmokeSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11k client update UX smoke', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetServiceWorkerClientUpdateUxSmokeSnapshot', type: 'function', source: 'global alias 8O-11k client update UX smoke', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      severity: 'required',
      description: 'Client-side smoke UX banera aktualizacji Service Workera 8O-11k jest dostępny jako read-only audyt i nie rejestruje realnego Service Workera.'
    });

    defineModuleDeps('pwa-manifest-icon-cache-audit', [
      { path: 'VildaGHTherapyResourceAudit.getPwaManifestIconCacheSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11l PWA manifest/icon cache audit', script: 'vilda_gh_therapy_resource_audit.js' },
      { path: 'vildaGetPwaManifestIconCacheSnapshot', type: 'function', source: 'vilda_gh_therapy_resource_audit.js 8O-11l PWA manifest/icon cache global alias', script: 'vilda_gh_therapy_resource_audit.js' }
    ], {
      severity: 'required',
      description: '8O-11l: manifest/start_url/scope/icon cache audit PWA; snapshot read-only, bez rejestracji realnego Service Workera, bez dotykania Cache API i bez zmian danych klinicznych.'
    });


    defineModuleDeps('zscore-batch-xlsx', [XLSX], {
      description: 'Wsadowy import/eksport Z-score XLSX',
      pages: ['docpro.html'],
      script: 'app.js',
      loadAfter: ['vilda_deps.js', 'xlsx.full.min.js']
    });

    defineModuleDeps('circumference-module-pdf', [JS_PDF], {
      description: 'PDF modułu obwodów',
      pages: ['index.html', 'docpro.html'],
      script: 'circumference_module.js',
      loadAfter: ['vilda_deps.js']
    });

    defineModuleDeps('clcr-norms-xlsx', [XLSX], {
      description: 'Kalkulator klirensu — dane norm XLSX',
      pages: ['kalkulator-klirens.html'],
      loadAfter: ['vilda_deps.js', 'xlsx.full.min.js']
    });

    defineModuleDeps('clcr-pdf-export', [JS_PDF, HTML2CANVAS], {
      description: 'Kalkulator klirensu — eksport PDF',
      pages: ['kalkulator-klirens.html'],
      loadAfter: ['vilda_deps.js', 'jspdf.umd.min.js', 'html2canvas.min.js']
    });

    defineModuleDeps('clcr-docx-export', [DOCX, DOCX_PACKER], {
      description: 'Kalkulator klirensu — eksport DOCX z fallbackiem do DOC',
      pages: ['kalkulator-klirens.html'],
      critical: false,
      loadAfter: ['docx']
    });

    defineModuleDeps('diabetes-pdfmake-export', [PDFMAKE, PDFMAKE_CREATE, PDFMAKE_VFS], {
      description: 'Moduły cukrzycowe — eksport przez pdfMake',
      pages: ['cukrzyca.html'],
      script: 'cukrzyca.js',
      loadAfter: ['pdfmake.min.js', 'vfs_fonts.min.js']
    });

    defineModuleDeps('steroids-hpta-chart', [CHART], {
      description: 'Steroidy — wykres osi HPTA',
      pages: ['steroidy.html'],
      critical: false,
      loadAfter: ['chart.js']
    });

    defineModuleDeps('sga-birth-module-data', [
      { path: 'SGA_INTERGROWTH_ZS', type: 'object', source: 'sga_intergrowth_data.js', script: 'sga_intergrowth_data.js' },
      { path: 'SGA_MALEWSKI_WEIGHT', type: 'object', source: 'sga_malewski_data.js', script: 'sga_malewski_data.js' }
    ], {
      description: 'Moduł SGA — dane Intergrowth/Malewski',
      pages: ['docpro.html'],
      script: 'sga_birth_module.js',
      loadAfter: ['sga_intergrowth_data.js', 'sga_malewski_data.js']
    });

    defineModuleDeps('down-syndrome-lms-data', [
      { path: 'DS', type: 'object', source: 'ds_lms.js', script: 'ds_lms.js' }
    ], {
      description: 'Siatki LMS dla zespołu Downa',
      pages: ['index.html', 'docpro.html'],
      script: 'ds_lms.js',
      loadAfter: ['ds_lms.js']
    });

    defineModuleDeps('down-syndrome-ui-module', [
      { path: 'DS', type: 'object', source: 'ds_lms.js', script: 'ds_lms.js' },
      { path: 'VildaDownSyndrome', type: 'object', source: 'vilda_down_syndrome.js', script: 'vilda_down_syndrome.js' }
    ], {
      description: 'Moduł UI zespołu Downa',
      pages: ['index.html', 'docpro.html'],
      script: 'vilda_down_syndrome.js',
      loadAfter: ['ds_lms.js', 'vilda_down_syndrome.js']
    });

    defineModuleDeps('anorexia-risk-module', [
      { path: 'VildaAnorexiaRisk', type: 'object', source: 'vilda_anorexia_risk.js', script: 'vilda_anorexia_risk.js' },
      { path: 'detectAnRisk', type: 'function', source: 'vilda_anorexia_risk.js', script: 'vilda_anorexia_risk.js' },
      { path: 'anorexiaRiskAdjust', type: 'function', source: 'vilda_anorexia_risk.js', script: 'vilda_anorexia_risk.js' }
    ], {
      description: 'Moduł ryzyka anoreksji i korekty TEE',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_anorexia_risk.js',
      loadAfter: ['vilda_anorexia_risk.js']
    });

    defineModuleDeps('data-import-export-helpers', [
      { path: 'VildaDataImportExport', type: 'object', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.sanitizeAdvancedMeasurementEntries', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.sanitizeIntakeHistoryEntries', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.collectUserData', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.saveUserData', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.initJsonDataImportExport', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.setFieldValueSilently', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.setCheckboxValueSilently', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.applyResultsModeRestoreState', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.applyDataSourceRestoreState', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.withHistoryRestoreGuards', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.rehydrateAdvancedFromState', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.rehydrateAdvancedRowsUIFromState', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.rehydrateIntakeFromState', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.anyDataEntered', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.updateSaveBtnVisibility', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.maybeDisableLoadIfNeeded', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.getVildaPersistenceAdapter', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.hasMainSessionStorage', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.isMainSessionAutosavePaused', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.clearMainSessionStorage', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.saveMainSessionNow', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.scheduleMainSessionSave', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.finalizeMainSessionRestore', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.restoreMainSessionIfAny', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.hasMeaningfulMainSessionData', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.attachMainSessionClearHandler', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.initMainSessionPersistence', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.resetGrowthHistoryModulesAfterClear', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.clearAllData', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'vildaPersistClearAfterUserClear', type: 'function', source: 'app.js persistence clear bridge', script: 'app.js' },
      { path: 'VildaDataImportExport.showRestoreButton', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.restoreLoadedState', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.initRestoreStateButton', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.validateJsonImportFile', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.parseJsonImportText', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.readImportFileAsText', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.handleFile', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.normalizeSharedPersistRoot', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.syncSharedUserDataFromLoadedData', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.applyLoadedData', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.getFinalAudit', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'VildaDataImportExport.getApiSurfaceStatus', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'handleFile', type: 'function', source: 'vilda_data_import_export.js / app.js wrapper', script: 'vilda_data_import_export.js' },
      { path: 'normalizeSharedPersistRoot', type: 'function', source: 'vilda_data_import_export.js / app.js wrapper', script: 'vilda_data_import_export.js' },
      { path: 'syncSharedUserDataFromLoadedData', type: 'function', source: 'vilda_data_import_export.js / app.js wrapper', script: 'vilda_data_import_export.js' },
      { path: 'applyLoadedData', type: 'function', source: 'vilda_data_import_export.js / app.js wrapper', script: 'vilda_data_import_export.js' },
      { path: 'vildaDataImportExportFinalAudit', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'vildaDataImportExportStatus', type: 'function', source: 'vilda_data_import_export.js', script: 'vilda_data_import_export.js' },
      { path: 'vildaRehydrateAdvancedFromState', type: 'function', source: 'vilda_data_import_export.js / app.js wrapper', script: 'vilda_data_import_export.js' },
      { path: 'vildaRehydrateAdvancedRowsUI', type: 'function', source: 'vilda_data_import_export.js / app.js wrapper', script: 'vilda_data_import_export.js' },
      { path: 'vildaRehydrateIntakeFromState', type: 'function', source: 'vilda_data_import_export.js / app.js wrapper', script: 'vilda_data_import_export.js' },
      { path: 'syncNames', type: 'function', source: 'vilda_data_import_export.js / app.js wrapper', script: 'vilda_data_import_export.js' }
    ], {
      description: 'Helpery importu/eksportu JSON, eksport modelu danych, zapis pliku, wiring przycisków, cichy restore pól/trybów, rehydratacja historii advanced/intake, autosave sesji głównej, hook czyszczenia sharedUserData po clearAllData oraz obsługa wyboru pliku JSON, walidacja pliku, FileReader synchronizacja sharedUserData po imporcie, applyLoadedData() oraz diagnostyka końcowa 8M',
      pages: ['index.html', 'docpro.html', 'kalkulator-klirens.html'],
      script: 'vilda_data_import_export.js',
      loadAfter: ['vilda_data_import_export.js']
    });
  }

  // ── PERF: leniwe ładowanie ciężkich bibliotek eksportu PDF ────────────────
  // jsPDF (~96 KB) + html2canvas (~38 KB) były ładowane synchronicznie w <head>
  // KAŻDEJ strony (index/docpro/kalkulator), blokując render — choć są potrzebne
  // wyłącznie przy generowaniu PDF (rzadka akcja). Teraz wstrzykujemy je z CDN
  // dopiero przy pierwszym eksporcie. URL + SRI muszą zgadzać się z dawnymi tagami.
  const __PDF_LIBS = {
    jspdf: {
      test: function () { return !!(global.jspdf && typeof global.jspdf.jsPDF === 'function'); },
      src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'
    },
    html2canvas: {
      test: function () { return typeof global.html2canvas === 'function'; },
      src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H'
    }
  };
  const __pdfLibPromises = Object.create(null);
  function __loadPdfLib(key) {
    const lib = __PDF_LIBS[key];
    if (!lib) return Promise.reject(new Error('Nieznana biblioteka PDF: ' + key));
    if (lib.test()) return Promise.resolve();
    if (__pdfLibPromises[key]) return __pdfLibPromises[key];
    __pdfLibPromises[key] = new Promise(function (resolve, reject) {
      try {
        const doc = global.document;
        if (!doc) { reject(new Error('Brak document — nie można załadować ' + key)); return; }
        const ready = function () {
          if (lib.test()) resolve();
          else { __pdfLibPromises[key] = null; reject(new Error(key + ' załadowane, ale obiekt niedostępny.')); }
        };
        const existing = doc.querySelector('script[data-vilda-pdf-lib="' + key + '"]');
        if (existing) {
          existing.addEventListener('load', ready);
          existing.addEventListener('error', function (e) { __pdfLibPromises[key] = null; reject(e || new Error('Błąd ładowania ' + key)); });
          return;
        }
        const s = doc.createElement('script');
        s.src = lib.src;
        s.integrity = lib.integrity;
        s.crossOrigin = 'anonymous';
        s.async = true;
        s.setAttribute('data-vilda-pdf-lib', key);
        s.onload = ready;
        s.onerror = function (e) { __pdfLibPromises[key] = null; reject(e || new Error('Nie udało się załadować ' + key)); };
        (doc.head || doc.documentElement).appendChild(s);
      } catch (err) {
        __pdfLibPromises[key] = null;
        reject(err);
      }
    });
    return __pdfLibPromises[key];
  }
  // Ładuje obie biblioteki potrzebne do eksportu PDF (jsPDF + html2canvas).
  // Wywoływane na początku każdej ścieżki generującej PDF, przed kontraktem zależności.
  function ensurePdfLibraries() {
    return Promise.all([__loadPdfLib('jspdf'), __loadPdfLib('html2canvas')]);
  }
  // Tylko jsPDF (np. kalkulator klirensu / wybrane strony, które nie rasteryzują canvas
  // — choć dla bezpieczeństwa większość ścieżek woła ensurePdfLibraries()).
  function ensureJsPdfLibrary() { return __loadPdfLib('jspdf'); }

  const api = {
    __vildaDepsHelper: true,
    version: VERSION,
    get: resolve,
    resolve,
    has,
    isFunction,
    isObject,
    require: requireDependency,
    requireFunction,
    requireObject,
    requireAny,
    warnMissing,
    defineModuleDeps,
    defineModuleDependencies,
    getModuleDeps,
    listModuleDeps,
    moduleDepsReady,
    defineLoadOrderRule,
    getLoadOrderRules,
    getModuleContracts,
    listModules,
    checkModuleDeps,
    checkCriticalDependencies,
    checkScriptOrder,
    getScriptInventory,
    getDependencyStatus,
    dumpContracts,
    dumpCriticalDependencies,
    buildMissingDependencyMessage,
    showDependencyNotice,
    notifyMissingDependencies,
    createMissingDependenciesError,
    getNotices,
    getDiagnostics,
    getMissing,
    getContractChecks,
    resetDiagnostics,
    setDebug,
    currentPageKey,
    ensurePdfLibraries,
    ensureJsPdfLibrary
  };

  global.VildaDeps = api;
  global.vildaDeps = api;
  global.vildaRequireFunction = function (path, options) { return requireFunction(path, options); };
  global.vildaRequireObject = function (path, options) { return requireObject(path, options); };
  global.vildaDependencyDiagnostics = getDiagnostics;
  global.vildaDependencyContracts = getModuleContracts;
  global.vildaCheckCriticalDependencies = checkCriticalDependencies;
  global.vildaCriticalDependencyCheck = checkCriticalDependencies;
  global.vildaDependencyStatus = getDependencyStatus;
  global.vildaDumpCriticalDependencies = dumpCriticalDependencies;
  global.vildaShowDependencyNotice = showDependencyNotice;
  global.vildaNotifyMissingDependencies = notifyMissingDependencies;
  global.vildaEnsurePdfLibraries = ensurePdfLibraries;
  global.vildaEnsureJsPdfLibrary = ensureJsPdfLibrary;

  registerDefaultContracts();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
