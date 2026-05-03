# Plan optymalizacji `app.js` — kroki, które wykonam za Ciebie po kolei

Poniżej jest praktyczny plan w formule **„ja robię, Ty akceptujesz”**.
Każdy krok kończy się konkretnym artefaktem (commit/raport), żeby było łatwo kontrolować postęp.

## Krok 1 — Audyt techniczny i mapa hotspotów (wykonam)

Co zrobię:
1. Przeanalizuję `app.js` pod kątem:
   - największych sekcji odpowiedzialności,
   - miejsc o wysokim ryzyku kosztu runtime (DOM, eventy, persystencja),
   - punktów wspólnych zależności globalnych.
2. Zbuduję listę funkcji kandydujących do wydzielenia w pierwszej kolejności.
3. Oznaczę „quick wins” (bezpieczne, małe zmiany o wysokim wpływie).

Co dostaniesz ode mnie:
- Commit z dokumentem audytowym `docs/appjs_audit.md`.
- Krótką listę TOP 10 hotspotów z priorytetami P1/P2/P3.

## Krok 2 — Instrumentacja wydajności (wykonam)

Co zrobię:
1. Dodam lekką telemetrykę (`performance.mark/measure`) dla:
   - startu inicjalizacji,
   - kluczowych ścieżek kalkulacji,
   - operacji persystencji.
2. Dodam przełącznik `DEBUG_PERF`, żeby pomiary były aktywne tylko diagnostycznie.
3. Upewnię się, że nie zmieniam logiki biznesowej (tylko pomiary).

Co dostaniesz ode mnie:
- Commit z instrumentacją.
- Raport „baseline” z pierwszymi wynikami pomiarów (w `docs/perf_baseline.md`).

## Krok 3 — Pierwsze wydzielenie modułu (wykonam)

Co zrobię:
1. Wydzielę jeden spójny obszar z `app.js` (najpierw ten o największym zysku i najniższym ryzyku), np.:
   - `gh-therapy-sync` **albo**
   - kontrolę źródeł danych wzrastania.
2. Zostawię w `app.js` tylko mostek/orchestrację do nowego modułu.
3. Zachowam API i kompatybilność wsteczną.

Co dostaniesz ode mnie:
- Commit refaktoryzacyjny (bez zmiany zachowania).
- Notatkę „przed/po” (rozmiar sekcji, ryzyko, wpływ).

## Krok 4 — Optymalizacja DOM i eventów (wykonam)

Co zrobię:
1. Przejrzę i uproszczę nasłuchy zdarzeń:
   - gdzie się da, przejdę na delegację zdarzeń,
   - usunę zbędne duplikacje handlerów.
2. Ograniczę koszty aktualizacji UI:
   - batchowanie zmian,
   - cache powtarzanych odczytów DOM.
3. Dodam `debounce` tam, gdzie wpisywanie w pola odpala cięższe obliczenia.

Co dostaniesz ode mnie:
- Commit optymalizacyjny.
- Krótkie porównanie metryk przed/po dla akcji formularzowych.

## Krok 5 — Persystencja i redukcja I/O (wykonam)

Co zrobię:
1. Dodam bezpieczną warstwę cache dla najczęściej czytanych danych.
2. Ograniczę liczbę zapisów:
   - zapis tylko przy realnej zmianie wartości,
   - grupowanie zapisów (debounced flush).
3. Ujednolicę obsługę fallbacków i logowania błędów storage.

Co dostaniesz ode mnie:
- Commit z optymalizacją persystencji.
- Raport liczby operacji I/O przed/po.

## Krok 6 — Testy regresyjne + hardening (wykonam)

Co zrobię:
1. Dodam testy regresyjne dla krytycznych ścieżek (kalkulacje + synchronizacja danych).
2. Dodam checklistę do procesu zmian, by nie dopisywać nowej logiki z powrotem do monolitu.
3. Dodam prosty „guardrail” (np. ostrzeżenie przy nadmiernym wzroście `app.js`).

Co dostaniesz ode mnie:
- Commit z testami i zabezpieczeniami procesu.
- Podsumowanie końcowe z listą zamkniętych ryzyk.

---

## Jak będziemy pracować iteracyjnie

- Realizuję **po jednym kroku na raz**.
- Po każdym kroku dostajesz:
  1. commit,
  2. krótkie podsumowanie,
  3. wyniki testów/checków,
  4. propozycję następnego kroku.

Dzięki temu możesz zatrzymać prace po dowolnym etapie lub zmienić priorytety bez utraty już wykonanych efektów.
