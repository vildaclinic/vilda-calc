# Krok 8 — walidacja równoważności i baseline po 7A/7B/7C

## Zakres wykonania

1. Rozszerzono smoke suite (`vilda_smoke_tests.js`) o test kontraktu:
   - `plan-modules-contract`

2. Test sprawdza obecność i API modułów:
   - `VildaPlanInput` (`readPlanInputFromDom`, `isPlanInputComplete`)
   - `VildaPlanEnergy` (`buildPlanState`, `resolvePlanDiets`)
   - `VildaPlanRender` (`renderPlanUnavailable`, `renderNoDietsAvailable`)
   - bridge `updatePlanFromDiet` w `window`.

3. Podbito metadane smoke suite do:
   - `VERSION = 2.16.0`
   - `STEP = 8O-12b`

## Cel

- formalne potwierdzenie, że po modularizacji 7A/7B/7C kontrakty modułów są stabilne,
- wcześniejsze wykrywanie regresji integracyjnych przed kolejnymi refaktorami.

## Proponowany kolejny krok

Krok 9: snapshot „przed/po” dla rezultatu `updatePlanFromDiet` (HTML + kluczowe flagi UI) uruchamiany w kontrolowanym scenariuszu danych wejściowych.
