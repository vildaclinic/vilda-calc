# Krok 7A — ekstrakcja wejścia dla `updatePlanFromDiet`

## Zakres wykonania

Wdrożono pierwszy etap planu kroku 7:

1. Dodano nowy moduł `vilda_plan_input.js` z API:
   - `readPlanInputFromDom(options)`
   - `isPlanInputComplete(planInput, options)`

2. W `app.js` funkcja `updatePlanFromDiet()` korzysta teraz z `window.VildaPlanInput` do:
   - odczytu danych wejściowych,
   - walidacji kompletności danych.

3. Zachowano kompatybilność wsteczną:
   - jeśli moduł nie jest dostępny, `updatePlanFromDiet()` używa lokalnego fallbacku.

4. Zaktualizowano kolejność ładowania skryptów (`index.html`, `docpro.html`, `kalkulator-klirens.html`) tak, aby `vilda_plan_input.js` był ładowany przed `app.js`.

5. Zaktualizowano smoke manifest (`vilda_smoke_tests.js`) o `vilda_plan_input.js?v=1` oraz `app.js?v=152`.

## Oczekiwany efekt

- mniejsza odpowiedzialność `updatePlanFromDiet` w `app.js`,
- łatwiejsze testowanie i refaktor kolejnych etapów (7B/7C),
- brak zmiany zachowania UI.
