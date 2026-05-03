# SPA Krok A — bezpieczny scaffold routera (opt-in)

## Co wdrożono

1. Dodano moduł `vilda_spa_router.js` z API:
   - `VildaSpaRouter.normalizeRoute`
   - `VildaSpaRouter.createRouter`
   - `VildaSpaRouter.initSpaRouter`

2. Router jest **domyślnie włączony**.
   - wyłącza się tylko gdy `window.VILDA_ENABLE_SPA_ROUTER === false`
   - zachowano tryb awaryjny opt-out (flaga globalna).

3. Dodano obsługę hash-route (`#/...`) i bezpieczne przechwytywanie lokalnych linków `.html`.

4. Podłączono skrypt do entrypointów:
   - `index.html`
   - `docpro.html`
   - `kalkulator-klirens.html`

5. Zaktualizowano oczekiwany manifest smoke (`vilda_smoke_tests.js`) o:
   - `vilda_spa_router.js?v=2`
   - `app.js?v=156`

## Jak przetestować lokalnie (bez ryzyka)

W konsoli przeglądarki:

```js
window.VILDA_ENABLE_SPA_ROUTER = false; // jeśli chcesz tymczasowo wyłączyć router
location.reload();
```

Po odświeżeniu można testować nawigację hashową i zdarzenia route bez pełnego przejścia na SPA.

## Kolejny krok (B)

Wydzielenie pierwszego widoku (`index`) do modelu mount/unmount i renderowanie w kontenerze `#app` z zachowaniem fallbacku MPA.
