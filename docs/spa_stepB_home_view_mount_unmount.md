# SPA Krok B — pierwszy widok w modelu mount/unmount (Home)

## Co wdrożono

1. Dodano moduł widoku `vilda_spa_view_home.js`:
   - `VildaSpaViews.Home.mount(options)`
   - `VildaSpaViews.Home.unmount(options)`

2. Router (`vilda_spa_router.js`) został rozszerzony:
   - dla tras home (`/`, `/index`, `/index.html`) montuje widok Home,
   - przy opuszczeniu tras home wykonuje `unmount`.

3. Podłączono skrypty w entrypointach przed `app.js`:
   - `vilda_spa_view_home.js?v=1`
   - `vilda_spa_router.js?v=3`
   - `app.js?v=157`

4. Rozszerzono smoke suite o kontrakt:
   - `spa-home-view-contract`.

## Dlaczego to bezpieczne

- nie usuwamy istniejącego MPA,
- SPA działa jako warstwa kompatybilności,
- mount/unmount ma minimalny, odwracalny zakres.

## Kolejny krok (C)

Migracja drugiego widoku (`docpro`) do tego samego modelu mount/unmount + walidacja przejść między `home <-> docpro` bez pełnego reloadu.
