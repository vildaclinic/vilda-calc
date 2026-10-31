# Własne szablony planów opieki

Biblioteka jest prywatną biblioteką zalogowanego lekarza. Szablon opisuje ogólny schemat pracy, a nie stan konkretnego pacjenta. Nie zawiera gotowych zaleceń medycznych ani automatycznie wybranych terminów. Nazwy, instrukcje i kryterium zakończenia kroku ustala lekarz.

## Biblioteka i kreator

Wejście „Moje szablony” znajduje się przy Planach opieki. Kreator ma trzy części: „Nazwa”, „Etapy i kroki” oraz „Podgląd”. Powrót do wcześniejszej części zachowuje formularz. Zapis wymaga co najmniej jednego etapu i jednego kroku w każdym etapie; puste etapy mogą istnieć podczas edycji.

Etapy mają kolejność. Kroki wewnątrz etapu są równoległe. Każdy krok ma osobno rodzaj oraz jawne kryterium zakończenia: potwierdzenie wykonania, otrzymanie wyniku albo zapisanie decyzji. Rodzaj i nazwa nie zastępują tego wyboru. Szablon, w którym wszystkie kroki są opcjonalne, jest prawidłowy; późniejsze zastosowanie u pacjenta będzie wymagało wybrania co najmniej jednego kroku.

Reguła przypomnienia to brak terminu albo liczba dni, tygodni lub miesięcy od ręcznego uruchomienia danego etapu. Zero oznacza dzień uruchomienia; puste pole nie oznacza zera. Szablon nie zapisuje dat kalendarzowych, nie tworzy wydarzeń i nie uruchamia etapów po otrzymaniu wyniku.

Podgląd pokazuje wszystkie nazwy, instrukcje, kryteria zakończenia, reguły przypomnień i domyślne dołączenie. Zapis nowej wersji nie zmienia wcześniejszych wersji. Archiwizacja zachowuje treść i historię; przywrócenie do aktywnej biblioteki jest osobną czynnością. Utworzenie kopii nadaje nowe identyfikatory szablonu, etapów i kroków.

Zastosowanie szablonu do pacjenta, dopasowanie jego kopii i zapis etapowego planu pozostają kolejnym etapem wdrożenia. Dotychczasowe ręczne plany nadal używają V1; zapis pacjentów w V2 pozostaje wyłączony.

## Kopia układu planu pacjenta

„Zapisz układ jako szablon” tworzy odłączony formularz w pamięci. Kopiowane są wyłącznie nazwy i układ kroków oraz znany ogólny rodzaj. Nazwa szablonu, opis, etykiety i instrukcje zaczynają się puste. Formularz otrzymuje nowe identyfikatory. Nie przenosi pacjenta, dokumentów, wyników, faktów, stanów, powodów pominięcia, dat, rezerwacji ani historii.

W dawnym planie V1 nie ma jawnego kryterium zakończenia ani względnej reguły przypomnienia. Lekarz wybiera je w kreatorze; data dawnego przypomnienia nie staje się przesunięciem. Jedna wirtualna grupa nie odtwarza nieznanych etapów historycznych.

Same nazwy kroków mogą zawierać dane pacjenta. Przed pierwszym zapisem całego układu lekarz musi przejrzeć wszystkie widoczne teksty i potwierdzić ich sprawdzenie. Zmiana tekstu unieważnia potwierdzenie. Nie jest to automatyczna anonimizacja. Przed potwierdzeniem dane formularza pozostają w RAM; blokada konta lub zmiana właściciela widoku usuwa formularz. Biblioteka nie oznacza formularza pacjenta jako zmienionego i nie tworzy Notatek pacjenta.

## Wersje, konflikty i ponowienia

Treść wersji jest niezmienna. Nowy zapis dopisuje wersję oraz operację z trwałym identyfikatorem. Data techniczna nie rozstrzyga konfliktu i nie jest datą kliniczną. Zapis identycznej treści nie tworzy kolejnej wersji treści; trwałe potwierdzenie operacji nadal zajmuje miejsce w historii.

Równoczesna edycja na dwóch urządzeniach zachowuje obie wersje. Dotyczy to również edycji równoległej z archiwizacją. Nierozstrzygnięty szablon wymaga jawnego wyboru wersji i stanu archiwum. Zwykły kolejny zapis ani samo odczytanie obu zmian nie potwierdzają tego wyboru. Formularz po konflikcie zachowuje wpisane wartości.

Dwa równoczesne zapisy tej samej nowej treści mogą mieć różne identyfikatory niezmiennych wersji i również wymagają wyboru. To nie jest wybór nowszej daty ani automatyczne utożsamienie dokumentów po nazwie. Zgodne operacje dotyczące tego samego identyfikatora wersji i stanu archiwum mogą się uzgodnić, zachowując oba wpisy historii.

Ponowienie tej samej operacji korzysta z jej pierwotnego zamiaru i szyfrogramu. Użycie tego samego identyfikatora do innej zmiany jest błędem. Niejednoznaczna odpowiedź nie upoważnia do wygenerowania nowego identyfikatora i ponownego utworzenia szablonu.

Wspólny kodek ogranicza definicję do 32 etapów, 64 kroków na etap, 256 kroków łącznie i 20 etykiet. Kanoniczna definicja ma najwyżej 256 KiB UTF-8. Historia jednego szablonu ma najwyżej 64 wersje treści i 2048 operacji. Przekroczenie limitu przerywa nowy zapis z komunikatem, zachowując formularz i wcześniejsze dane; nic nie jest po cichu przycinane.

Lokalny magazyn ma łączny limit 256 MiB faktycznych i zarezerwowanych danych. Obejmuje wszystkie szyfrogramy, metadane, historię, nieczytelne zachowane rekordy oraz miejsce potrzebne do późniejszego wysłania i potwierdzenia oczekujących operacji. Każdy zapis sprawdza rozliczenie w tej samej transakcji co zmieniane wiersze; importowane liczniki nie są dowodem rozmiaru. Całe konto ma najwyżej 16 384 rekordy szablonów i tyle samo operacji. Osobny limit dziennika przesyłek wynosi 64 MiB. Przekroczenie któregokolwiek limitu odrzuca nową partię w całości.

## Oddzielny zapis i synchronizacja

Biblioteka ma własny zaszyfrowany magazyn konta. Nie jest zbiorem zwykłych Notatek ani dodatkowym polem w dawnym blobie pacjentów. Nie zmienia formatów V1 pacjentów, wyników i planów. Klucz oraz dane szyfrowania biblioteki są powiązane z właściwą tożsamością konta, niezależnie od lokalnego identyfikatora urządzenia.

W trybie prywatnym potwierdzony zapis lokalny jest trwały, a oczekujące operacje mogą później dotrzeć do chmury. Zapis chmurowy wymaga sprawdzonego potwierdzenia serwera. Tryb bez lokalnego cache nie otrzymuje ukrytej trwałej kopii; brak potwierdzenia pozostawia formularz i nie jest komunikatem „zapisano”.

Synchronizacja biblioteki korzysta z istniejącego cyklu synchronizacji aplikacji, z osobnym wynikiem tej domeny. Nie ma drugiego klinicznego harmonogramu. Operacje zależne są wysyłane po potwierdzonych poprzednikach. Potwierdzenie dotyczy dokładnego identyfikatora operacji, szyfrogramu i generacji biblioteki. Zmiana generacji zatrzymuje stare oczekujące operacje; nie oznacza ich automatycznie nową generacją.

Obsługa synchronizacji wymaga zgodnego zaplecza `care-template-library`, z osobno sprawdzaną tożsamością, generacją i dziennikiem niezmiennych szyfrogramów. Brak usługi, nieobsługiwana odpowiedź lub błąd uwierzytelnienia nie powodują przesłania danych biblioteki dawnym kanałem pacjentów ani wyświetlenia pozornie pustej biblioteki.

Kod zaplecza jest przygotowywany i testowany w `vildaclinic/vilda-source`. Scalenie samej zmiany strony nie wdraża workera. Przegląd, wdrożenie zaplecza i operacje na rzeczywistym koncie wymagają osobnej decyzji właściciela. Sam raport zdrowia serwera nie jest potwierdzeniem obsługi biblioteki.

Wdrożenie zgodnego API zaplecza jest zależnością przed publikacją klienta: bez niego nie można potwierdzić chmurowego zapisu biblioteki ani bezpiecznego braku biblioteki przy operacjach usuwania lub zmiany tożsamości. Biblioteka prywatna może zachować zapis lokalny z jawną informacją o niedostępnej synchronizacji.

## Kopie i operacje na koncie

Kopia biblioteki musi zachować wszystkie utrzymane wersje, operacje, konflikty oraz wiedzę o ponowieniach. Dawna kopia pacjentów i Notatek sama nie stanowi kopii tej oddzielnej domeny. Interfejs eksportu musi jawnie pokazywać zakres pliku; nie wolno przedstawić niepełnego eksportu jako pełnej kopii konta.

Eksport odczytuje spójny obraz magazynu w jednej transakcji. Wspólny limit zaszyfrowanego pliku `.vctlib` wynosi 512 MiB; eksport sprawdza ten sam limit co importer. Z rozliczanego limitu magazynu, stałego narzutu koperty i kodowania AES-GCM/base64 wynika mniejszy maksymalny rozmiar poprawnej kopii. Są to granice zapisu i formatu, a nie obietnica czasu importu lub wydajności edytora przy maksymalnym zbiorze.

Import sprawdza format, klucze, tożsamość, limity i cały materiał przed zmianą magazynu. Nieobsługiwane dane pozostają zachowane do odczytu przez zgodną wersję; nie stają się pustym szablonem do nadpisania. Przeniesienie do innej tożsamości nie jest ponownym oznaczeniem dawnych oczekujących operacji.

Wymiana klucza lub tożsamości oraz pełne usunięcie danych wymagają obsługi obu domen przed pierwszą destrukcyjną zmianą. Nieobsługiwana operacja zatrzymuje się z komunikatem. Samo usunięcie dawnego bloba pacjentów nie dowodzi usunięcia biblioteki. Potwierdzona część operacji i pozostała część muszą być rozróżnialne po błędzie, aby można było bezpiecznie wznowić czynność.

Ta wersja odmawia usunięcia lokalnego konta z zapisanymi lub oczekującymi szablonami; samo wyeksportowanie pliku nie odblokowuje usunięcia. Zmiana tożsamości synchronizacji i usunięcie danych serwera wymagają sprawdzonego braku chronionej biblioteki. Zainicjalizowana biblioteka, także pusta po wyczyszczeniu, wymaga osobnego przepływu migracji lub usuwania; klient nie wykonuje go automatycznie. Niepewna lub niedostępna odpowiedź serwera zatrzymuje te czynności. Zwykła zmiana hasła zachowująca ten sam klucz danych nie przenosi biblioteki do innej tożsamości.

Izolacja szyfrogramów od starszej wersji aplikacji nie jest gwarancją odzyskania utraconego klucza. Nie przywracamy automatycznie konta świadomie usuniętego starszą wersją. Kopie danych i właściwy materiał kluczowy pozostają potrzebne do odtworzenia dostępu.

## Walidacja

Testy wykorzystują wyłącznie fikcyjne konta i dane. Obejmują kodek oraz granice rozmiaru, niezmienność historii, konflikty między urządzeniami, dokładne ponowienia, rzeczywiste transakcje magazynu, zmiany sesji i klucza, osobny kanał synchronizacji, starsze klienty i serwer, kopie oraz kreator na komputerze i telefonie. Scenariusz offline wymaga rzeczywistego cache produkcyjnych zasobów i wyłączonego serwera.

Wyniki końcowych przebiegów i ograniczenia wdrożenia są wpisywane do PR. Testy nie stanowią walidacji medycznej schematów wpisywanych przez lekarza.
