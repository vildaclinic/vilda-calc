# Krok 3 — notatka przed/po (wydzielenie `gh-therapy-sync`)

## Co wydzielono

Z `app.js` wydzielono logikę modułu synchronizacji terapii GH/IGF do nowego pliku:
- `vilda_gh_therapy_sync.js`

Wydzielone elementy:
- inicjalizacja i obsługa IndexedDB (`ghTherapyDB`, `ghTherapyPoints`),
- operacje storage (`GH_THERAPY_POINTS`) przez `VildaPersistence`,
- BroadcastChannel `gh-therapy-sync` i lifecycle cleanup,
- eksport publicznego API przez `window.VildaGHTherapySync`.

## Jak zachowano kompatybilność

W `app.js` pozostawiono funkcje-bridge o tych samych nazwach, które delegują do `window.VildaGHTherapySync`:
- `openGHTherapyDB`,
- `getTherapyPointsFromDB`, `clearTherapyPointsInDB`,
- funkcje modułowego storage,
- funkcje BroadcastChannel.

Dzięki temu istniejące wywołania w aplikacji nie wymagają zmian API.

## Zmiany ładowania skryptów

Nowy moduł jest ładowany przed `app.js` na stronach używających głównego kalkulatora:
- `index.html`,
- `docpro.html`,
- `kalkulator-klirens.html`.

## Wpływ i ryzyko

- **Wpływ:** mniejsza odpowiedzialność `app.js` w obszarze GH/IGF sync, łatwiejsze dalsze refaktoryzacje.
- **Ryzyko:** niskie/umiarkowane — zależne od kolejności ładowania skryptów i dostępności `window.VildaGHTherapySync`.
- **Mitigacja:** bridge w `app.js` zwraca bezpieczne wartości fallback (`false`/`[]`/`null`) i nie zmienia kontraktu wywołań.
