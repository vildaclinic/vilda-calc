# Krok 9 — snapshot kontraktu UI dla `updatePlanFromDiet`

## Zakres wykonania

1. Dodano helper `vildaCaptureUpdatePlanSnapshot(options)` w `app.js`.
   - zwraca znormalizowany snapshot UI sekcji planu,
   - zawiera pole `signature` do szybkich porównań „przed/po”.

2. Helper został opublikowany jako:
   - `window.vildaCaptureUpdatePlanSnapshot`.

3. Rozszerzono smoke suite (`vilda_smoke_tests.js`) o nowy test:
   - `update-plan-snapshot-contract`.

4. Test sprawdza:
   - dostępność helpera,
   - poprawny format wyniku (`ok === true`, `signature` jako string).

5. Podbito metadane smoke suite:
   - `VERSION = 2.17.0`
   - `STEP = 8O-12c`

## Cel

- przygotowanie stabilnego punktu odniesienia do porównań równoważności UI po kolejnych refaktorach,
- szybsze wykrywanie regresji wizualno-logicznych w `updatePlanFromDiet`.

## Proponowany kolejny krok

Krok 10: dodać scenariusz „golden snapshot” (kontrolowane dane wejściowe + oczekiwane `signature`) i porównanie automatyczne w smoke suite.
