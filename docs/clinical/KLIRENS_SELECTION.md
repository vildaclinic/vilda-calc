# Klirens — wybór formuły i prowadzenie do danych

Decyzja właściciela28.10.2026, po makiecie listy desktop/mobile i potwierdzeniu regresji w aktualnej aplikacji. Dotyczy interakcji formularza; nie zmienia wzorów ani progów klinicznych.

## Lista formuł

Lista ma równe odstępy8px, delikatne obramowania, duże miejsca do dotknięcia i nie dziedziczy ciężkich szklanych cieni ani skalowania przycisków. Szerokość jest taka sama jak pole wyszukiwania, także przy długich nazwach. Dopasowanie i kolejność wyników nadal wyznacza istniejący `ClcrUiModel.formulaSearch`.

Rozwinięcie następuje po świadomym kliknięciu pola, wpisaniu tekstu albo użyciu strzałki. Programowe odtworzenie wartości/fokusu nie otwiera listy. Escape, Tab opuszczający kontrolkę, wybór formuły, kliknięcie poza komponentem, zmiana podstrony i powrót zwijają listę bez kasowania frazy. Strzałki i Enter działają jako combobox, a dotykowe przewijanie nie wybiera przypadkowego wyniku.

`ClcrUiWorkflow.closeSearch(reason)` jest jedyną publiczną operacją zwijania. Ujednolica stan `hidden`, klasę otwarcia i ARIA. Powłoka wywołuje ją defensywnie podczas odejścia i wejścia do zachowanej ramki. Kliknięcia w dokumencie rodzica również zwijają listę; nasłuch rodzica jest usuwany przy `pagehide`, a ponownie wiązany przy `pageshow`. Zwykłe ukrycie ramki przez CSS nie jest zastępowane samym `visibilitychange`.

Położenie i maksymalna wysokość uwzględniają rzeczywisty viewport oraz widoczny dock. Przy małej ilości miejsca poniżej lista pojawia się nad polem z8px odstępu od etykiety. Zniknięcie kotwicy z ekranu zwija popup.

## Brakujące dane po wyborze

Wybór z listy, kafelka, wariantu, natywnego pickera i publicznego kompatybilnego `selectClcrFormula` prowadzi przez wspólny workflow. Ścieżka odtwarzania stanu używa `refresh`, a kompatybilny wybór podczas `__vildaPersistRestoring` nie przewija ani nie resetuje danych.

Po końcowym ułożeniu dynamicznej karty jedna anulowalna operacja:

1. Odczytuje bieżące wymagania i wynik aktualnego silnika gotowości, nie dawną szeroką listę pól innego trybu.
2. Oznacza tylko widoczne, puste kontrolki potrzebne do liczby; nie dodaje pytań o normę lub pełną interpretację. Nie zmienia czerwonego sygnału błędnej wartości.
3. Przewija do pierwszej kontrolki wymagającej działania. Przy komplecie danych prowadzi do pojedynczego wyniku lub jego komunikatu semantycznego.
4. Przenosi fokus na opis pola/sekcji bez wywoływania klawiatury numerycznej. Respektuje ograniczenie ruchu i wysokość nagłówka.

Nowy wybór, wpisywanie danych, odtworzenie lub zmiana podstrony unieważniają odroczone przewijanie. Zwykłe przeliczanie i zmiana wartości aktualizują wyróżnienie, ale nie uruchamiają kolejnej nawigacji. Wpisane dane próbki, jednostki i tryb zachowują dotychczasowe zasady; nie wraca stary reset formularza dla audytowanych kart.

W aktualnej bazie `custom-fixes.js` zastępuje `Element.scrollIntoView` pustą funkcją na ekranach<700px. To wyjaśniało część potwierdzonej regresji na telefonach. Workflow nie zmienia tej globalnej polityki: wyłącznie świadomy wybór formuły używa `scrollTo` z rzeczywistą geometrią widocznej kontrolki lub jej przewijanego kontenera. Dzięki temu nie wracają automatyczne skoki przy codziennym wpisywaniu wartości.

## Sprawdzenie

Testy przeglądarkowe `klirens-search-interaction.spec.mjs` i `klirens-selection-guidance.spec.mjs` wywołują rzeczywiste selektory, silniki gotowości i renderery na1440/390/320px. Obejmują zamykanie z rodzica, rzeczywistą powłokę z zachowaną ramką i fikcyjnym adapterem I/O, klawiaturę/dotyk, widoczne wymagane pola, zmianę trybu, komplet danych, odtworzenie bez przewijania, szybkie przełączanie oraz zachowanie wpisanych danych. Oryginalne obiekty sejfu pozostają zablokowane; nie używa się rzeczywistych danych pacjentów.
