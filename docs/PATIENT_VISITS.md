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
- Pierwszą wizytę nadaje formularzowi zwykły odczyt danych: autozapis sesji albo sprawdzenie wskaźnika zapisu. Jeżeli wypadnie to przy otwartym oknie „Niezapisane zmiany”, strażnik nie uznaje tego za zmianę formularza. Wizyta musi być nowa, bez pacjenta albo pacjenta formularza, a reszta formularza bez zmian (P-WIZYTA-PRZYDZIAL, `docs/ZRODLA_ARTEFAKTOW.md`).

`user.pubertyAssessmentVisit.visitId` pozostaje odrębnym znacznikiem oceny pokwitania. Nie wolno go traktować jako globalnego identyfikatora wizyty.

## Dawne dane

Z dostępnych dawnych wersji można odtworzyć tylko wizyty przybliżone. Preferowana jest zapisana data medyczna; czas technicznego zapisu jest rozwiązaniem zastępczym. Dzień dla znaczników czasu wyznaczamy w stałej strefie `Europe/Warsaw`, niezależnie od strefy urządzenia; brak daty pozostaje nieznany. Wynik otrzymuje `origin: legacy-inferred`, jest oznaczany w interfejsie i nie stanowi pewnego dowodu, że tego dnia odbyła się dokładnie jedna wizyta.

Przypisanie musi być stabilne pomiędzy urządzeniami i utrwalone przed scaleniem kart pacjenta. Przeniesienie zapisów do innego `patientId` nie może nadać wizytom nowych identyfikatorów. Wersji usuniętych przed tą zmianą nie można odzyskać; dwa rzeczywiste spotkania tego samego dnia w starym formacie mogą pozostać nierozróżnialne.

## Przeglądanie

`VildaVault.getPatientVisits(patientId)` udostępnia wizyty oraz ich kanoniczne zapisy. Nowa „Historia wizyt” w Karcie pacjenta pokazuje datę, wiek i zapisane dane wizyty. Podgląd nie wczytuje formularza, nie zapisuje nowych wartości klinicznych i nie przelicza dawnych wyników według aktualnych norm. Zmiana pacjenta lub konta unieważnia oczekujący odczyt.

„Historia wersji” pozostaje narzędziem szczegółowej historii i jawnego przywracania. Osobna makieta przestrzennej osi wizyt nie jest częścią tej implementacji.

### Odczyt, edycja i kartoteka

Po wybraniu pacjenta Gabinet pokazuje ostatni zapis w trybie odczytu. W Analizie
i osadzonym DocPro można obejrzeć zapisane pomiary, dane pokwitaniowe, dane
okołoporodowe i zastosowane ustawienia obliczeń. Dane wizyty można zmieniać po
wybraniu „Rozpocznij nową wizytę” lub „Edytuj wizytę” w szczegółach konkretnej
wizyty. Samo otwarcie Historii wizyt zachowuje bieżący formularz.

„Edytuj pacjenta” zapisuje dane stałe w [kartotece](PATIENT_PROFILE.md).
Ogólne notatki i pozostała dokumentacja pacjenta mają własny zapis. Kalkulatory
pomocnicze oraz wybór wersji dokumentu PDF mogą być dostępne także przy
odczycie wizyty. Ich ustawienia pozostają w narzędziu lub w preferencjach
użytkownika.

### Dokumentacja otwartej wizyty

W nowym Gabinecie zapis nowego wpisu z rozpoczętej lub edytowanej wizyty
trafia automatycznie do tej wizyty. Obejmuje to m.in. notatki z Karty pacjenta,
wyniki z Jednostek lab. i przypomnienia dodawane do planu. Formularz zachowuje
`visitId` przechwycony przy otwarciu. Wybór innej wizyty, pacjenta lub konta
unieważnia ten formularz. Notatka z rozpoczętej wizyty może być pierwszym
zapisem wizyty bez pomiarów. Wspólna blokada zapisu nowego dokumentu
i przeniesienia wizyty do kosza rozstrzyga, która operacja nastąpiła wcześniej.

Data pobrania próbki, data zdarzenia i termin przypomnienia zachowują odrębne
znaczenie. Edycja istniejącego wpisu zachowuje jego pierwotne pochodzenie.
Wpisy ogólne pozostają dostępne podczas przeglądania kartoteki. Dawne wpisy
zachowują zapisane daty i kotwice wieku. Historia rozpoznaje dokumenty
konkretnej wizyty po jej identyfikatorze.

### Dokumentacja po przeniesieniu wizyty do kosza

W edycji historycznej wizyty w nowym Gabinecie lekarz może przenieść do kosza zapisane wersje wybranej wizyty. Historia i porównanie w Analizie korzystają z pozostałych wizyt tego pacjenta. Dwa spotkania zapisane pod tą samą datą mają odrębne identyfikatory.

Karta pacjenta przechowuje badania, notatki, plany opieki, rozpoznania z kodem ICD-10, epizody leczenia i przypomnienia jako samodzielne wpisy. Lekarz ma do nich dostęp również po przeniesieniu ostatniej wizyty do kosza. Każdy taki wpis zachowuje swój identyfikator oraz pierwotne powiązanie `visitContext`, jeśli zostało zapisane. Może to obejmować pojedynczą czynność w planie lub kontrolę w przebiegu leczenia. Data pobrania próbki, data kontroli i termin przypomnienia zachowują własne znaczenie.

Pomiary i pozostała treść zapisanej wersji trafiają do kosza razem z wizytą. Obejmuje to historyczne kopie danych okołoporodowych, wzrostu rodziców i oznaczenia zespołu Downa, a także zapisane w tej wersji punkty terapii GH z DocPro. Niezależna kartoteka i kopie tych wartości w pozostałych wizytach są nadal dostępne. Po przeniesieniu ostatniej wizyty zakładka Status pokazuje „Brak zapisanych wizyt”. Ze strony tej samej kartoteki można rozpocząć nową wizytę lub otworzyć historię i przywrócić poprzednią.

Przywrócona wizyta ma ten sam `visitId`. Jej szczegóły ponownie odczytują dokumenty dla tej pary `patientId` i `visitId`, łącznie z późniejszymi poprawkami wpisanymi w Karcie pacjenta. Ogólne notatki oraz wpisy dotyczące innego spotkania zachowują własny zakres.

## Zgodność i wycofanie

Eksport, import, synchronizacja i scalanie pacjentów muszą przenosić `payload.visit` razem z pełnym stanem. Przy zapisie poprawki z klienta bez metadanych trzeba zachować rozpoznaną tożsamość; nie wolno usuwać ostatniego stanu wizyty wyłącznie z powodu synchronizowanej automatycznej retencji. Nie zmieniamy kryptografii ani norm klinicznych.

Wymóg wdrożenia: zaktualizować wszystkie urządzenia oraz otwarte karty aplikacji. Starsza aplikacja korzystająca bezpośrednio z tej samej bazy IndexedDB nadal wykonuje własną retencję i może nadpisać stan bez `visit`. Nowy kod nie zatrzyma operacji wykonanej przez taki proces; ochrona odbiorcy synchronizacji nie odzyskuje ostatniej lokalnej kopii, jeżeli stary proces już ją usunął. Nie podnosimy wersji bazy ani nie dodajemy w tym wydaniu nowej blokady starych klientów. Zmierzone w testach na danych fikcyjnych (2026-11-16; `docs/clinical/ALGORITHMS.md`, P-ZBIEZNOSC-ZDARZEN, E3-PR0b): retencja każdej wersji starszej niż 1.1.535 rusza po zapisie nowej wersji karty, która ma co najmniej 10 zapisów, i zostawia najnowszy zapis, zapisy przypięte, wszystko z ostatnich 24 godzin, z ostatnich 30 dni najnowszy zapis z każdego dnia, ze starszych — z każdego miesiąca, razem najwyżej 40, więc z 8 wizyt z 8 dni sprzed 40–54 dni zostaje u niej 1, a bieżący odbiorca jej nagrobków retencji zachowuje stan każdej z 8 wizyt.

Dla niezmienionych dawnych rekordów identyfikator jest deterministycznie wyznaczany podczas odczytu, bez modyfikacji sejfu. Jest przenoszony w eksporcie i utrwalany przy operacji nowego klienta, przed zmianą właściciela przy scalaniu. To nie jest masowa migracja wszystkich danych przy otwarciu historii. Zmiana daty lub właściciela przez starszego klienta przed utrwaleniem metadanych może zmienić takie przybliżone przypisanie.

Wycofanie wydania wymaga zachowania reguły retencji wizyt: uruchomienie dawnej aplikacji ze starym automatycznym przycinaniem może usunąć historyczne stany. Przed organizacyjnym powrotem do starszego wydania należy wykonać zaszyfrowaną kopię i wyłączyć jego automatyczne przycinanie. Ochrona w nowej aplikacji nie zmienia kodu już uruchomionego starszego klienta.
