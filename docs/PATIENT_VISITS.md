# Trwała tożsamość wizyty pacjenta

Baza implementacji: `audyt` `40d742d38f4d2924d3ba85a50d746790d0de6644` (14.11.2026).

## Wizyta a zapis wersji

`patientId` identyfikuje kartę pacjenta, `visitId` — wizytę, a `snapshotId` — techniczny zapis jej stanu. Jedna wizyta może mieć wiele zapisów. Numer `seq` nadal służy wyłącznie porządkowaniu wersji przy remisie czasu. Nie jest numerem wizyty.

Tożsamość znajduje się w szyfrowanym `payload.visit` razem z klinicznym stanem zapisu. Format ma `version: 1`, `visitId`, `patientId`, `clinicalDateISO`, `createdAtISO` i `origin`; dla dawnych zapisów także `dateSource`. Nowe wizyty otrzymują losowy UUID z kryptograficznego generatora przeglądarki. Data medyczna jest odrębna od czasu zapisu. Korekta daty nie zmienia `visitId`.

Nie powstaje nowy magazyn ani osobny nieszyfrowany indeks danych klinicznych. Metadane istniejących znaczników usunięcia mogą zawierać `visitCipher`: zaszyfrowany obiekt `{version: 1, visitId}`, bez dat medycznych i pomiarów. Pozwala on zachować decyzję o ręcznym usunięciu również po wygaśnięciu 30-dniowej treści Kosza; obowiązuje dotychczasowy 365-dniowy czas życia znacznika usunięcia. Bieżąca rodzina modułów przestrzeni klinicznej obsługuje ten szyfr; historyczne rodziny pozostają niezmienne. Najnowszy zachowany zapis każdej wizyty jest jej pełnym stanem. Kolejność wersji wewnątrz wizyty jest zgodna z dotychczasowym odczytem głównego zapisu (`yr`: czas utworzenia zapisu, potem czas poprawki, rewizja i rozstrzygnięcie remisu). Przypięcie lub poprawienie starszej technicznej wersji nie zastępuje nowszej. Jawne przywrócenie tworzy nowy zapis tej samej wizyty. Retencja może usuwać nadmiarowe wersje techniczne, ale musi zachować co najmniej jeden pełny zapis każdej wizyty, także po przekroczeniu dotychczasowego limitu 40 wersji. Liczba przechowywanych zapisów może więc wzrosnąć. Jawne usuwanie przez użytkownika pozostaje osobną operacją. Znana ręcznie usunięta najnowsza wersja nadal rozstrzyga, który zapis wizyty podlegał ochronie: samo jej usunięcie nie nadaje trwałej ochrony starszym, wcześniej przyciętym rewizjom. Nie odtwarzamy z tego powodu danych z cienia retencji. Nowszy jawny zapis lub przywrócenie zachowuje normalne reguły porządkowania.

## Cykl pracy

- Pierwszy zapis bieżącej wizyty utrwala identyfikator; kolejne poprawki zachowują go.
- „Nowy pomiar” tworzy nową wizytę, również tego samego dnia. Zmiana daty kalendarzowej sama nie kończy otwartego kontekstu wizyty.
- „Odtwórz zapis” i przywrócenie dawnej wersji kontynuują tożsamość tej wizyty; techniczna wersja nadal otrzymuje własny identyfikator.
- Jawny import zwykłego pliku JSON zachowuje tożsamość wizyty, wiążąc ją z zaakceptowanym lokalnym kontekstem karty. Identyfikator pacjenta z pliku nie nadaje uprawnień do lokalnej karty. Spóźniony odczyt pliku po zmianie konta, pacjenta, formularza lub po nowszym imporcie jest odrzucany.
- Sesja formularza przenosi `visit` przez odświeżenie strony i przejście Start/DocPro. Sam identyfikator, bez danych pacjenta, nie tworzy niepustego formularza.
- Nowy pomiar w karcie pacjenta tworzy osobną wizytę; edycja pomiaru zachowuje identyfikator. Dopisanie historycznego punktu wzrastania nie jest automatycznie nową bieżącą wizytą.
- Powiązanie z `patientId` jest potwierdzane wynikiem zapisu w sejfie. Zmiana konta, czyszczenie i zmiana pacjenta nie mogą przenieść obcego kontekstu.

`user.pubertyAssessmentVisit.visitId` pozostaje odrębnym znacznikiem oceny pokwitania. Nie wolno go traktować jako globalnego identyfikatora wizyty.

## Dawne dane

Z dostępnych dawnych wersji można odtworzyć tylko wizyty przybliżone. Preferowana jest zapisana data medyczna; czas technicznego zapisu jest rozwiązaniem zastępczym. Dzień dla znaczników czasu wyznaczamy w stałej strefie `Europe/Warsaw`, niezależnie od strefy urządzenia; brak daty pozostaje nieznany. Wynik otrzymuje `origin: legacy-inferred`, jest oznaczany w interfejsie i nie stanowi pewnego dowodu, że tego dnia odbyła się dokładnie jedna wizyta.

Przypisanie musi być stabilne pomiędzy urządzeniami i utrwalone przed scaleniem kart pacjenta. Przeniesienie zapisów do innego `patientId` nie może nadać wizytom nowych identyfikatorów. Wersji usuniętych przed tą zmianą nie można odzyskać; dwa rzeczywiste spotkania tego samego dnia w starym formacie mogą pozostać nierozróżnialne.

## Przeglądanie

`VildaVault.getPatientVisits(patientId)` udostępnia wizyty oraz ich kanoniczne zapisy. Nowa „Historia wizyt” w Karcie pacjenta pokazuje datę, wiek i zapisane dane wizyty. Podgląd nie wczytuje formularza, nie zapisuje nowych wartości klinicznych i nie przelicza dawnych wyników według aktualnych norm. Zmiana pacjenta lub konta unieważnia oczekujący odczyt.

„Historia wersji” pozostaje narzędziem szczegółowej historii i jawnego przywracania. Osobna makieta przestrzennej osi wizyt nie jest częścią tej implementacji.

Notatki ogólne, plany opieki, wyniki badań i historia leczenia zachowują dotychczasowe zasady. Nie przypisujemy ich do wizyty wyłącznie na podstawie takiej samej daty. Nowy identyfikator daje podstawę do późniejszych jednoznacznych powiązań i prezentacji stanu leczenia na dzień wizyty.

## Zgodność i wycofanie

Eksport, import, synchronizacja i scalanie pacjentów muszą przenosić `payload.visit` razem z pełnym stanem. Przy zapisie poprawki z klienta bez metadanych trzeba zachować rozpoznaną tożsamość; nie wolno usuwać ostatniego stanu wizyty wyłącznie z powodu synchronizowanej automatycznej retencji. Nie zmieniamy kryptografii ani norm klinicznych.

Wymóg wdrożenia: zaktualizować wszystkie urządzenia oraz otwarte karty aplikacji. Starsza aplikacja korzystająca bezpośrednio z tej samej bazy IndexedDB nadal wykonuje własną retencję i może nadpisać stan bez `visit`. Nowy kod nie zatrzyma operacji wykonanej przez taki proces; ochrona odbiorcy synchronizacji nie odzyskuje ostatniej lokalnej kopii, jeżeli stary proces już ją usunął. Nie podnosimy wersji bazy ani nie dodajemy w tym wydaniu nowej blokady starych klientów.

Dla niezmienionych dawnych rekordów identyfikator jest deterministycznie wyznaczany podczas odczytu, bez modyfikacji sejfu. Jest przenoszony w eksporcie i utrwalany przy operacji nowego klienta, przed zmianą właściciela przy scalaniu. To nie jest masowa migracja wszystkich danych przy otwarciu historii. Zmiana daty lub właściciela przez starszego klienta przed utrwaleniem metadanych może zmienić takie przybliżone przypisanie.

Wycofanie wydania wymaga zachowania reguły retencji wizyt: uruchomienie dawnej aplikacji ze starym automatycznym przycinaniem może usunąć historyczne stany. Przed organizacyjnym powrotem do starszego wydania należy wykonać zaszyfrowaną kopię i wyłączyć jego automatyczne przycinanie. Ochrona w nowej aplikacji nie zmienia kodu już uruchomionego starszego klienta.
