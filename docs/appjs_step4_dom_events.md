# Krok 4 — Optymalizacja DOM i eventów (iteracja 1)

## Zakres wykonanych zmian

W sekcji `setupEstimatedIntake()` ograniczono liczbę kosztownych aktualizacji UI i kalkulacji wywoływanych seriami zdarzeń.

### 1) Batchowanie aktualizacji widoczności (RAF)

Dodano `scheduleIntakeVisibilityUpdate`, które:
- buforuje opcje wywołania,
- łączy wiele zdarzeń `input/change` w jedno wykonanie,
- wykonuje aktualizację w `requestAnimationFrame` (fallback: `setTimeout`).

Efekt: mniejsza liczba redundantnych wywołań `updateIntakeToggleVisibility` przy szybkim wpisywaniu.

### 2) Zastąpienie bezpośrednich wywołań handlerów

Nasłuchy pól (`weight/height/age/ageMonths/sex`) i `dataSource` korzystają teraz z harmonogramu (`scheduleIntakeVisibilityUpdate`) zamiast natychmiastowego uruchamiania pełnej ścieżki UI.

### 3) Debounce dla `resize`

Przeliczenia na `window.resize` zostały opóźnione przez `debounce(..., 120)`, aby uniknąć lawiny wywołań `calcEstimatedIntake()` podczas przeciągania okna/rotacji ekranu.

## Oczekiwany wpływ

- Mniej re-renderów i obliczeń podczas intensywnego wpisywania danych użytkownika.
- Stabilniejsze działanie modułu estimated intake na urządzeniach mobilnych (rotacja / zmiana viewportu).
- Brak zmian kontraktów API — modyfikacja dotyczy tylko organizacji event loop i częstotliwości wywołań.
