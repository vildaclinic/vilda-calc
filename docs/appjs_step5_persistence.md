# Krok 5 — Persystencja i redukcja I/O (iteracja 1)

## Zakres

W module `vilda_gh_therapy_sync.js` dodano pierwszą warstwę optymalizacji storage dla klucza `GH_THERAPY_POINTS`:

1. **Cache in-memory odczytu**
   - `readGhTherapyPointsFromModuleStorage()` zwraca kopię danych z cache, jeśli cache jest już dostępny,
   - przy pierwszym odczycie aktualizuje cache i jego zserializowaną reprezentację.

2. **Deduplikacja zapisów (diff check)**
   - `writeGhTherapyPointsToModuleStorage(points)` serializuje dane i porównuje z ostatnią zapisaną wersją,
   - jeśli dane się nie zmieniły, zapis do persistence jest pomijany.

3. **Synchronizacja cache przy clear**
   - `clearGhTherapyPointsModuleStorage()` po skutecznym usunięciu klucza czyści także cache lokalny.

## Oczekiwany wpływ

- Mniej zbędnych zapisów do warstwy persistence przy powtarzających się danych.
- Mniej odczytów z persistence podczas częstych operacji import/sync.
- Brak zmiany publicznego API modułu (`window.VildaGHTherapySync`).
