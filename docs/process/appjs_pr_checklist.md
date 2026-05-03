# Checklist PR — zmiany wokół `app.js`

- [ ] Czy nowa logika trafia do modułu domenowego, a nie bezpośrednio do `app.js`?
- [ ] Czy zachowano kompatybilność API globalnego (`window.*`) dla istniejących wywołań?
- [ ] Czy dla cięższych ścieżek dodano/utrzymano pomiary `vildaPerfStart` (gdy `DEBUG_PERF=true`)?
- [ ] Czy ograniczono nadmiarowe eventy (debounce/RAF batching/delegacja), jeśli dotyczy?
- [ ] Czy ograniczono zbędne operacje persistence (cache/diff write), jeśli dotyczy?
- [ ] Czy smoke suite (`vilda_smoke_tests.js`) ma zgodne oczekiwane wersje skryptów?
- [ ] Czy uruchomiono `node --check app.js` i `node --check` dla nowych modułów?
- [ ] Czy uruchomiono `scripts/check_appjs_size.sh`?
