# Krok 1: Audyt techniczny `app.js` (hotspoty + priorytety)

## 1) Snapshot stanu

- Rozmiar pliku: **20 623 linii** (`wc -l app.js`).
- Liczba deklaracji funkcji (`function` + `async function`): **386**.
- Przybliżona liczba odwołań do obszarów potencjalnie kosztownych (`addEventListener`, `indexedDB`, `localStorage`, selektory DOM): **625**.

Wniosek: `app.js` jest nadal monolitem integrującym wiele domen, więc największy zysk da podział odpowiedzialności + telemetryka przed dalszym refaktorem.

## 2) Mapa głównych obszarów odpowiedzialności

1. **Sync terapii GH/IGF + storage** (IndexedDB/BroadcastChannel/fallbacki).【F:app.js†L62-L75】【F:app.js†L77-L153】
2. **Kontrola źródeł danych wzrastania i trybu wyników** (sync kontrolek, uprawnienia, dostępność).【F:app.js†L599-L626】
3. **Plan dietetyczny i podsumowania metaboliczne** (duże funkcje domenowe z logiką i UI).【F:app.js†L3121-L3448】【F:app.js†L8291-L8950】
4. **Analiza historyczna punktów i sekcje pomocnicze UI**.【F:app.js†L9745-L9940】【F:app.js†L5439-L5566】
5. **Konfiguracja/obsługa estimated intake** (rozbudowana ścieżka kalkulacji i reakcji UI).【F:app.js†L15831-L16045】

## 3) TOP 10 hotspotów (P1/P2/P3)

## P1 (najpierw)
1. `setupEstimatedIntake` — wysoki potencjał kosztu runtime + dużo zależności UI. 【F:app.js†L15831-L16045】
2. `generateMetabolicSummary` — centralna logika podsumowania metabolicznego. 【F:app.js†L8291-L8762】
3. `updatePlanFromDiet` — kluczowa ścieżka planu żywieniowego, wysoki wpływ na UX. 【F:app.js†L3121-L3448】
4. Ścieżka sync GH/IGF (IndexedDB + fallbacki) — krytyczna dla spójności danych. 【F:app.js†L77-L153】

## P2
5. `handleMetabolicSummaryClick` — handler spinający interakcję i logikę. 【F:app.js†L8771-L8950】
6. `buildHistoricalPointAnalysis` — analiza danych historycznych (potencjalnie cięższe przeliczenia). 【F:app.js†L9745-L9940】
7. `syncGrowthDataSourceInputs` + `updateGrowthDataSourceControls` — synchronizacja stanu kontrolek i dostępu. 【F:app.js†L599-L626】

## P3
8. `repositionDoctor` — logika stricte UI (potencjalny koszt przy częstych wywołaniach). 【F:app.js†L5439-L5566】
9. `showTooltip` — mała, ale często wywoływana ścieżka interfejsu. 【F:app.js†L308-L340】
10. `clearTherapyPointsInDB` / `getTherapyPointsFromDB` — stabilizacja I/O i harmonizacja obsługi błędów. 【F:app.js†L129-L198】

## 4) Quick wins (bezpieczne zmiany o wysokim wpływie)

1. Dodać `performance.mark/measure` wokół P1 (bez zmiany logiki).【F:app.js†L3121-L3448】【F:app.js†L8291-L8762】【F:app.js†L15831-L16045】
2. Dodać `debounce` dla ścieżek formularzowych, które wywołują cięższe przeliczenia. 【F:app.js†L8771-L8950】【F:app.js†L15831-L16045】
3. Ograniczyć nadmiarowe operacje storage przez zapis tylko przy realnym diffie. 【F:app.js†L77-L153】
4. Wydzielić pierwszy moduł o najniższym ryzyku API (rekomendacja: GH/IGF sync albo growth-data-source controls).【F:app.js†L77-L153】【F:app.js†L599-L626】

## 5) Kolejność wykonania (następny krok)

Rekomenduję teraz wejść w **Krok 2: instrumentacja wydajności** i objąć pomiarami tylko P1/P2, aby od razu uzyskać baseline „przed/po” dla kolejnych refaktorów.
