# Krok 2: Baseline wydajności (P1/P2)

## Co zostało zainstrumentowane

W `app.js` dodano lekki mechanizm pomiaru czasu (`vildaPerfStart`) aktywowany tylko gdy `window.DEBUG_PERF === true`.

Oznaczone ścieżki:
- P1: `updatePlanFromDiet`
- P1: `generateMetabolicSummary`
- P1: `getTherapyPointsFromDB`
- P1: `clearTherapyPointsInDB`
- P2: `handleMetabolicSummaryClick`
- P2: `buildHistoricalPointAnalysis`
- P2: `syncGrowthDataSourceInputs`
- P2: `updateGrowthDataSourceControls`

## Jak uruchomić pomiar

1. W konsoli przeglądarki ustaw:
   `window.DEBUG_PERF = true`
2. Wykonaj scenariusze użytkownika dla P1/P2.
3. Odczytaj logi w konsoli (`[VILDA PERF] ... ms`) oraz wpisy `performance.measure`.

## Baseline „przed/po”

W tym środowisku CLI nie ma uruchomionej sesji przeglądarki użytkownika, więc nie da się zebrać reprezentatywnych czasów interakcji UI.

Tabela do uzupełnienia po uruchomieniu w przeglądarce:

| Ścieżka | Przed (ms) | Po (ms) | Zmiana % |
|---|---:|---:|---:|
| P1:updatePlanFromDiet |  |  |  |
| P1:generateMetabolicSummary |  |  |  |
| P1:getTherapyPointsFromDB |  |  |  |
| P2:handleMetabolicSummaryClick |  |  |  |
| P2:buildHistoricalPointAnalysis |  |  |  |
