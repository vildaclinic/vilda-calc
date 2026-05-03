# Krok 7B — ekstrakcja obliczeń energii dla `updatePlanFromDiet`

## Zakres wykonania

1. Dodano moduł `vilda_plan_energy.js` z API:
   - `buildPlanState(planInput, options)`
   - `resolvePlanDiets(planState, context, options)`

2. `updatePlanFromDiet()` w `app.js` korzysta teraz z `window.VildaPlanEnergy` dla:
   - budowy `planState` (TEE/BMR/deficyty),
   - wyznaczenia listy diet.

3. Zachowano fallback kompatybilności:
   - w razie braku modułu używana jest dotychczasowa logika lokalna (`energyBuildPlanReductionState`, `proposeDietsFromTEE`).

4. Zaktualizowano kolejność ładowania skryptów (`index.html`, `docpro.html`, `kalkulator-klirens.html`) o `vilda_plan_energy.js` przed `app.js`.

5. Zaktualizowano smoke manifest (`vilda_smoke_tests.js`) o:
   - `vilda_plan_energy.js?v=1`,
   - `app.js?v=153`.

## Oczekiwany efekt

- dalsze odchudzenie `updatePlanFromDiet` w `app.js`,
- łatwiejszy krok 7C (wydzielenie renderu),
- brak zmiany zachowania funkcjonalnego.
