# Krok 10 — golden snapshot dla `updatePlanFromDiet`

## Zakres wykonania

1. Rozszerzono smoke suite o test:
   - `update-plan-golden-snapshot`

2. Test używa kontrolowanego mock DOM i wywołuje:
   - `window.vildaCaptureUpdatePlanSnapshot`

3. Walidowana jest dokładna sygnatura (`signature`) dla scenariusza referencyjnego:
   - brak diet,
   - widoczny `planCard` i `planResults`,
   - ukryte kontrolki wyboru diety.

4. Podbito metadane smoke suite:
   - `VERSION = 2.18.0`
   - `STEP = 8O-12d`

## Cel

- automatyczne wykrywanie regresji UI w krytycznej ścieżce planu,
- twardy punkt odniesienia „przed/po” po modularizacji 7A/7B/7C.
