# Krok 7C — ekstrakcja renderu dla `updatePlanFromDiet`

## Zakres wykonania

1. Dodano moduł `vilda_plan_render.js` z API:
   - `renderPlanUnavailable(reason, context)`
   - `renderNoDietsAvailable(context)`

2. `updatePlanFromDiet()` deleguje teraz do `window.VildaPlanRender` renderowanie dwóch ścieżek UI:
   - przypadek „plan niedostępny dla niemowląt”,
   - przypadek „brak dostępnych diet”.

3. Zachowano fallback kompatybilności:
   - jeśli moduł nie jest dostępny, działa dotychczasowy kod renderujący w `app.js`.

4. Zaktualizowano ładowanie skryptów (`index.html`, `docpro.html`, `kalkulator-klirens.html`) o `vilda_plan_render.js` przed `app.js`.

5. Zaktualizowano smoke manifest (`vilda_smoke_tests.js`) o:
   - `vilda_plan_render.js?v=1`,
   - `app.js?v=154`.

## Oczekiwany efekt

- domknięcie etapu 7A/7B/7C,
- dalsze odchudzenie odpowiedzialności `updatePlanFromDiet`,
- prostsze testowanie warstwy renderującej niezależnie od obliczeń.
