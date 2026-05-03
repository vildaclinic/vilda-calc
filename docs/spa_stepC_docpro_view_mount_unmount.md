# SPA Krok C — migracja widoku DocPro do mount/unmount

## Co wdrożono

1. Dodano moduł `vilda_spa_view_docpro.js`:
   - `VildaSpaViews.DocPro.mount(options)`
   - `VildaSpaViews.DocPro.unmount(options)`

2. Router (`vilda_spa_router.js`) rozszerzono o obsługę tras:
   - `/docpro`
   - `/docpro.html`

3. Router wykonuje lifecycle:
   - `home mount/unmount` dla tras home,
   - `docpro mount/unmount` dla tras docpro,
   - przy przejściach `home <-> docpro` bez pełnego reloadu.

4. Zaktualizowano entrypointy skryptów:
   - `vilda_spa_view_home.js?v=1`
   - `vilda_spa_view_docpro.js?v=1`
   - `vilda_spa_router.js?v=4`
   - `app.js?v=158`

5. Rozszerzono smoke suite o kontrakt:
   - `spa-docpro-view-contract`.

## Dlaczego to bezpieczne

- nadal zachowana kompatybilność MPA,
- lifecycle widoków jest minimalny i odwracalny,
- kontrakty smoke pilnują dostępności API widoków.

## Kolejny krok (D)

Migracja widoku `kalkulator-klirens` do modelu mount/unmount + test przejść `home <-> docpro <-> klirens` w jednej sesji.
