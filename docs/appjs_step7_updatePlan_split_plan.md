# Krok 7 — plan cięcia `updatePlanFromDiet` na 3 pliki

## Cel

Rozdzielić funkcję `updatePlanFromDiet` (P1 hotspot) na mniejsze moduły z czytelnymi kontraktami wejścia/wyjścia, bez zmiany zachowania UI.

## Proponowany podział (3 pliki)

## 1) `vilda_plan_input.js`
Odpowiedzialność:
- odczyt i walidacja danych wejściowych (wiek, płeć, masa, wzrost, PAL),
- normalizacja danych z formularza i snapshotu walidacji,
- zwrot jednego obiektu `planInput`.

Publiczne API:
- `readPlanInputFromDom(options)`
- `isPlanInputComplete(planInput)`

## 2) `vilda_plan_energy.js`
Odpowiedzialność:
- obliczenia energetyczne i dobór diet,
- budowa `planState` (TEE/BMR/deficyty),
- decyzje domenowe niezależne od DOM.

Publiczne API:
- `buildPlanState(planInput, options)`
- `resolvePlanDiets(planState, options)`

## 3) `vilda_plan_render.js`
Odpowiedzialność:
- render sekcji planu do DOM,
- pokazywanie/ukrywanie bloków i opisów,
- render komunikatów „brak diet / infant / warning”.

Publiczne API:
- `renderPlanResult(planState, renderContext)`
- `renderPlanUnavailable(reason, renderContext)`

---

## Co zostaje w `app.js`

W `app.js` zostanie cienki orchestrator:
1. `planInput = readPlanInputFromDom(...)`
2. walidacja kompletności,
3. `planState = buildPlanState(planInput, ...)`
4. `renderPlanResult(planState, ...)`

Ta warstwa zachowuje obecną nazwę i podpis `updatePlanFromDiet()` dla kompatybilności.

## Plan wdrożenia (małe PR-y)

### PR 7A — ekstrakcja wejścia
- dodać `vilda_plan_input.js`,
- przenieść tylko odczyt/walidację,
- `updatePlanFromDiet()` dalej renderuje po staremu.

### PR 7B — ekstrakcja obliczeń energii
- dodać `vilda_plan_energy.js`,
- przenieść logikę planState/diets,
- zachować dotychczasowe wartości końcowe (snapshot porównawczy).

### PR 7C — ekstrakcja renderu
- dodać `vilda_plan_render.js`,
- przenieść manipulacje DOM i treści komunikatów,
- `app.js` jako orchestrator.

## Kryteria akceptacji

1. Brak regresji składni (`node --check app.js` + nowe moduły).
2. Smoke suite przechodzi bez nowych błędów.
3. Wynik końcowy `updatePlanFromDiet()` dla tych samych danych wejściowych jest równoważny (snapshoty tekstu i kluczowych pól DOM).
4. Rozmiar sekcji `updatePlanFromDiet` w `app.js` istotnie maleje po PR 7C.

## Ryzyka i mitigacje

- **Ryzyko:** rozjazd logiki domenowej i renderu podczas przenosin.
  - **Mitigacja:** migracja etapowa 7A→7B→7C + snapshoty „przed/po”.
- **Ryzyko:** ukryte zależności globalne.
  - **Mitigacja:** jawny `renderContext` i `options` zamiast odwołań rozproszonych.
