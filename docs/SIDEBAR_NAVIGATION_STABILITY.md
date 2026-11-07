# Stała prezentacja panelu podczas nawigacji

Przejście między formularzami nie oznacza braku danych pacjenta. Powłoka zapamiętuje w RAM ostatnią sprawdzoną prezentację przycisków „Zapisz dane”, „Dokumenty”, „Wyczyść” i wskaźnika zapisu. Odtwarzanie docelowego formularza może nadal blokować działania, ale nie zmienia na chwilę całego panelu na szary ani wskaźnika na „Brak danych”.

`Sp_begin` w `vilda_shell.js` działa po istniejącym `Gp_f`, bez dodatkowego zapisu czy przeliczenia. Odczytuje świeżą decyzję `VildaSaveStatusIndicator.getCurrentDecision()`, a nie opóźnioną etykietę `getState()`. Dzięki temu edycja bezpośrednio przed nawigacją nie zachowuje wcześniejszego „Zapisano”.

Trwający zapis celowo zwraca niegotową decyzję porównania. Etykieta „Zapisywanie…” może wtedy przejść przez nawigację wyłącznie, gdy natywny SSI ją publikuje, a `DIX.isSaveUserDataPending()` potwierdza operację nadal należącą do bieżącego zakresu źródła. Nie nadaje to decyzji `ready=true` i nie odblokowuje żadnego przycisku. Bez tego potwierdzenia sama stara etykieta nie wystarcza.

Po takim przejściu gotowy formularz docelowy może jeszcze porównywać dane ze
starą referencją, podczas gdy oryginalny zapis trwa. Wskaźnik zachowuje wtedy
„Zapisywanie…”, także po zakończeniu zapisu źródłowego, aż formularz docelowy
przyjmie tę samą potwierdzoną referencję. Odczyty jej istniejącego odcisku są
chwilowe; mechanizm nie przechowuje danych pacjenta ani nie zapisuje referencji.
Zgodność referencji kończy podtrzymanie i odsłania rzeczywisty stan docelowy,
również „Niezapisane zmiany”. Nie jest wymagane osiągnięcie stanu „Zapisano”.
Strona bez formularza może pokazać potwierdzony wynik operacji źródłowej;
powrót do formularza nadal sprawdza przyjęcie referencji. Nowy zapis docelowy
kończy przejęcie wyniku starszej operacji, także jej późniejszego błędu.

Chrome uwzględnia tę sprawdzoną prezentację również nad gotowym formularzem.
Stan bez aktywnej prezentacji wraca bezpośrednio do natywnego wskaźnika.
Podtrzymanie dotyczy etykiety i jej opisu; rzeczywista dostępność przycisków
oraz ostrzeżenie przed czyszczeniem nadal wynikają z danych formularza.

Zakończenie odroczonego obliczenia należącego do odtwarzania publikuje osobny
sygnał gotowości. Wskaźnik odczytuje ponownie własny stan, a Chrome i powłoka
odświeżają prezentację. Ten sygnał nie oznacza wczytania pacjenta, nie
ustanawia referencji i nie uruchamia obliczeń klinicznych.
Oba natywne kontrolery „Zapisz dane” odczytują ten sam stan oczekiwania lub
błędu odtworzenia spożycia, więc jeden nie włącza przycisku wyłączonego przez
drugi. Zakończenie istniejącego obliczenia odświeża dostępność; samo kliknięcie
zapisu nadal przechodzi pełne kontrole konta, wizyty i gotowości danych.

Przechowywane są wyłącznie stan prezentacji i tożsamości potrzebne do jego sprawdzenia. Nie jest to uprawnienie do zapisu, czyszczenia lub wygenerowania dokumentu. Dotychczasowe `disabled`, `aria-disabled`, kontrolery natywne, kontrola aktywnej ramki i strażnik niezapisanych zmian pozostają źródłem dostępności działań. Atrybuty `data-menu-preparing` i `data-menu-was-enabled` sterują wyłącznie prezentacją.

„Wyczyść” jest natywnym przyciskiem, więc globalny styl `button:disabled`
zmniejsza również jego krycie do 45%. Podczas potwierdzonego przejścia, gdy
przycisk był wcześniej dostępny, zachowane są zarówno kolory, jak i pełne
krycie. Sam przycisk nadal pozostaje zablokowany do gotowości formularza.
Zwykły stan niedostępny poza tym przejściem zachowuje dotychczasowy wygląd.
Testy porównują również przezroczystość; sama zgodność wartości `color`
i `background` nie dowodzi niezmienności faktycznego wyglądu.

Prezentacja jest ważna wyłącznie w obrębie tej samej sesji klucza Vaulta, konta, pacjenta, wizyty i żądania nawigacji. Sprawdzane są rzeczywiste dokumenty źródłowy i docelowy, ich ramki oraz zapisany znacznik jawnego wczytania `vilda:sharedLoadSeq`. Jawne wczytanie, Nowa wizyta, Odtwórz, import, Wyczyść i rzeczywista edycja unieważniają poprzednią prezentację. Wylogowanie, tryb gościa, wymiana klucza, zmiana pacjenta lub przeładowanie docelowej ramki również kończą jej ważność.

Zwykłe `persist-restored`, `main-session-restored` i `dob-restored` oznaczają odtwarzanie tej samej sesji. Nie są samodzielnie nową wizytą. Liczniki `applyLoadedData` poszczególnych ramek nie są ze sobą porównywane.

Automatyczne zastąpienie nieaktualnej, wcześniej przygotowanej ramki jest osobnym, wąskim etapem istniejącego `Gp5_przeladuj`. Powłoka oczekuje wyłącznie jego konkretnego zwiększenia generacji i nowego dokumentu. Wycofany dokument nie jest źródłem konta ani uprawnienia. Ręczne `B`/Reload i dowolna inna podmiana dokumentu nie korzystają z tego wyjątku. Zwykłe powiadomienie startowe `guest:false` sprawdza bieżące granice sesji; wejście w tryb gościa nadal unieważnia prezentację. Klucz nowej ramki jest wiązany dopiero po opublikowaniu `AuthUI.isBootReady()`: jego ustanawianie podczas startu nie jest zmianą konta. Obce konto lub jawny tryb gościa są odrzucane także przed końcem startu, a wymiana już związanego klucza zawsze kończy prezentację.

Obserwacja stanu źródłowego SSI odczytuje wyłącznie jego opublikowaną etykietę i gotowość. Reaguje na zmianę samego stanu, a nie na zmianę tytułu, dzięki czemu opóźniona stara etykieta „Zapisano” nie zastępuje świeżo ustalonego „Niezapisane zmiany”. Potwierdzony własny zapis tej samej osoby jest sprawdzany istniejącą migawką DIX; prezentacja czeka na rzeczywistą publikację SSI. Nie odczytuje wtedy formularza ukrytej ramki. Widoczny błąd zapisu zachowuje własną etykietę, także gdy porównanie danych opisuje te dane jako niezapisane.

Każdy element wraca do aktualnego stanu po gotowości własnego źródła. Dokumenty udostępniają osobny odczyt `getReadinessPhase()` (`preparing`, `ready`, `unavailable`, `busy`); kształt istniejącego `getState()` jest zachowany. Prawdziwy brak wymaganych danych lub nieobsługiwana strona nadal daje stan niedostępny. Na podstronach bez formularza wskaźnik pozostaje prezentacją bieżącego pacjenta, a przyciski zachowują właściwą dla tej podstrony dostępność.

Nie ma limitu czasowego maskującego zmianę stanu, cache w pamięci trwałej ani zmiany referencji zapisu. Ta poprawka nie zmienia wzorów, danych klinicznych ani wyników obliczeń.

Testy jednostkowe wywołują rzeczywisty kod powłoki i Chrome: świeża decyzja wobec opóźnionej etykiety, koniec przygotowywania, strony bez formularza, brak uprawnień wynikających z kolorów, zmiany konta/klucza/pacjenta/dokumentu oraz jawne granice wizyty. Testy natywne muszą dodatkowo obserwować faktycznie malowane klatki na zimnych i rozgrzanych przejściach Start–DocPro przy normalnym i spowolnionym CPU.
