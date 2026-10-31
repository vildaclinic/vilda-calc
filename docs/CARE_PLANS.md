# Plany opieki — MVP

Plany opieki są zakładką Przypomnień i Karty pacjenta. Jeden pacjent może mieć kilka planów, a plan — kilka równolegle otwartych kroków. Kroki i decyzje wpisuje lekarz; moduł nie narzuca schematów diagnostyki, kwalifikacji do leczenia ani terminów kontroli.

## Zachowanie

- Dotychczasowe Przypomnienia zachowują kwalifikację do końca bieżącego lokalnego dnia. Przyszłe kroki i kroki bez daty są dostępne w planach. Samodzielne przypomnienie nie wymaga planu; przy dodawaniu można wskazać otwarty plan wybranego pacjenta.
- Termin wydarzenia, dzień przypomnienia/sprawdzenia wyniku i data rzeczywistego wykonania/otrzymania są osobne. Dołączenie istniejącego terminu zachowuje jego identyfikator.
- W edycji kroku świadome odznaczenie ustalonego terminu odłącza rezerwację od planu. Wydarzenie pozostaje w Terminarzu z tym samym identyfikatorem, treścią, datą, godziną i stanem. Odłączenie nie oznacza odwołania wizyty ani usunięcia przypomnienia kroku.
- Zapis wykonania lub wyniku kończy wybrany krok. Lekarz pozostawia pozostałe kroki, dodaje kolejny albo ustala dzień powrotu do decyzji. Plan pozostaje otwarty.
- Oznaczenie wizyty jako wykonanej nie kończy kroku oczekującego na wynik. Cofnięcie statusu wizyty ani oznaczenie niestawienia nie cofają otrzymania wyniku lub udokumentowanego wykonania. Przegląd po synchronizacji także nie zastępuje daty wykonania datą otrzymania wyniku.
- Edycja lub zapis wykonania terminu zachowanego w historii po przeglądzie dotyczy jego oryginalnego rekordu. Nie przestawia bieżącego kroku, dalszego postępowania ani statusu planu. Taki oryginał pozostaje dokumentacją planu; świadome odłączenie nadal nadaje mu status samodzielnego wydarzenia, także gdy informacja rodzica dotrze przed aktualizacją samego wydarzenia.
- Faktyczne wykonanie, otrzymanie wyniku i zapis ustalenia nie mogą mieć daty późniejszej niż bieżący lokalny dzień. Ograniczenie obowiązuje w formularzu oraz w sejfie. Przyszłe daty rezerwacji i przypomnień pozostają dozwolone; zwykła edycja dawnego wpisu nie przepisuje jego historycznych dat.
- Wybór pacjenta pokazuje datę urodzenia. Przy identycznej nazwie i dacie albo braku daty dodatkowo pokazuje jednoznaczny identyfikator wpisu, również po wyborze. Wyszukiwanie dołączanych terminów obejmuje łącznie tytuł i opis wydarzenia.
- Notatki w Karcie pacjenta pomijają dokumentację należącą do prawidłowo odczytanego planu opieki. Kroki, ustalenia i opisy wykonania są dostępne w planie, terminy w Terminarzu, a wyniki w Badaniach oraz przez pełny podgląd z planu. Dotyczy to otwartych i zamkniętych planów oraz istniejącego terminu dołączonego później do planu. Dokumentacja niezwiązana z planem zachowuje dotychczasowe miejsce w Notatkach.
- Podgląd wpisu z planu odczytuje bieżącą treść oryginalnego rekordu. Edycja wyniku w Badaniach jest widoczna po ponownym otwarciu go z planu; wcześniejszy opis kroku lub zapis w przebiegu planu nie zastępuje aktualnej treści wyniku. Wynik opisowy nie jest przeliczany na wynik liczbowy; data otrzymania nie staje się datą pobrania próbki. Główne Notatki pozostają biblioteką szablonów lekarza.
- Zamknięcie wymaga powodu i opisu. Otwarte kroki wymagają jawnej zgody na zakończenie bez wykonania. Powiązane wydarzenia pozostają w Terminarzu; zamknięcie planu nie odwołuje ich automatycznie. Wznowienie zachowuje historię i wykonane kroki.
- Na telefonie obowiązuje lista → szczegóły → powrót do zachowanej pozycji. Nie dodajemy pośredniego przycisku pełnego ekranu.

### Pominięcie kroku i powiązanie istniejącego wyniku

Pojedynczy otwarty krok można pominąć z obowiązkowym uzasadnieniem i datą decyzji. Pominięcie kończy pracę nad tym krokiem, zachowując jego identyfikator, wcześniejsze fakty i dokumenty. Nie potwierdza wykonania, otrzymania wyniku ani niestawienia się i nie odwołuje rezerwacji. Uzasadnienie powstaje jako jeden oryginalny wpis dokumentacji planu; nie jest dodatkową samodzielną Notatką pacjenta. Pozostałe kroki pozostają bez zmian, a rozstrzygnięcie ostatniego kroku pozostawia plan otwarty do decyzji lekarza.

Zmiany statusu i treści wydarzenia w Terminarzu zachowują świadome pominięcie. Zwykłe cofnięcie administracyjnego niestawienia nadal może przywrócić otwarty krok. Wznowienie pominiętego kroku wymaga osobnej decyzji, uzasadnienia, daty i wyboru stanu do wykonania lub oczekiwania na wynik; zachowuje oryginalne dokumenty i historię. Dawny stan `cancelled` sam w sobie nie dowodzi pominięcia. Etykieta „Pominięty” i bieżący powód wymagają sprawdzonego powiązania z decyzją; nie odtwarzamy ich z tytułów, treści ani samej obecności dawnego uzasadnienia.

Zamknięcie planu, zakończenie otwartych kroków podczas przeglądu zamkniętego planu i usunięcie przypomnienia nie zastępują wcześniej zapisanej daty klinicznej dzisiejszym dniem. Gdy zachowano jawny fakt bez znanej daty, data nadal pozostaje nieznana. Dzień decyzji organizacyjnej nie staje się dniem wykonania lub otrzymania wyniku.

Istniejący wynik można podpiąć po obejrzeniu oryginału, potwierdzeniu jego związku z krokiem i wpisaniu rzeczywistej daty otrzymania. Formularz nie wyznacza jej z daty badania, próbki ani technicznego czasu zapisu. Wybór obejmuje samodzielne wyniki opisowe i strukturalne tego pacjenta; wewnętrzne przypomnienia i oczekujące zlecenia nie są otrzymanymi wynikami. Projekcje wyników z dokumentów leczenia i odrębne wyniki Klirensu nie są elementami tego wyboru.

Powiązanie zachowuje oryginalny identyfikator, szyfrogram, rewizję, daty, treść oraz ewentualną przynależność wyniku do innego planu. Nie tworzy kopii wyniku i nie przepisuje go do nowego planu. Podgląd wskazuje bieżący oryginał; późniejsza edycja w Badaniach jest widoczna po ponownym otwarciu. Odnośniki z zachowanych wersji zmian są sprawdzane względem właściwego planu, kroku i historii, osobno od bieżącego powiązania.

Klient sprzed historii pochodzenia może zachować czytelne dokumenty, a usunąć ich nowsze dowody powiązania. Brak tych dowodów nie tworzy potwierdzonego pominięcia ani prawa do zewnętrznego wyniku. Przy nierozstrzygniętej historii pominięcia zmiana wydarzenia zatrzymuje się z jawnym błędem, bez zapisu i bez przypisania dawnego powodu do bieżącego stanu. Samo potwierdzenie przeglądu nie odtwarza utraconego pochodzenia; potrzebna jest nienaruszona kopia lub nowa świadoma decyzja organizacyjna. Własne dawne wyniki planu zachowują odczyt przez ścisłe istniejące powiązanie dokumentu z tym planem i krokiem.

## Zapis i integracje

`vilda_vault.js` przechowuje plan jako notatkę pacjenta kategorii `care-plan`. Wersjonowany `careContext` jest częścią zaszyfrowanej treści, razem z listą kroków, historią i identyfikatorami operacji. Nie powstaje nowy magazyn bazy ani jawny zapis planów w localStorage. Zewnętrzny `patientId` pozostaje jedynym właścicielem rekordu; kontekst nie utrwala jego osobnej kopii.

Powiązane notatki mają role `step`, `decision`, `calendar`, `result` lub `note`. Pomocniczy rekord kroku/decyzji zasila Przypomnienia. Faktyczne wydarzenie zasila Terminarz. Rozdzielenie tych ról zapobiega podwójnym wydarzeniom przy różnych dniach badania i przypomnienia. Techniczne rekordy planu i kroków nie są edytowane przez ogólny edytor Notatek pacjenta; właściwe wyniki i ustalenia pozostają dostępne z planu oraz odpowiednich widoków kartoteki.

Nowe zakończenia kroku zapisują opcjonalne `completionSource`: `calendar`, `performance` lub `result`. Wyłącznie jawne pochodzenie `calendar` pozwala cofnąć zakończenie kroku przez cofnięcie statusu samego wydarzenia. Brak pola w starszym zapisie albo jego pominięcie przez starszego klienta nie dowodzi braku wykonania; taki zakończony krok pozostaje zachowany. Nie odtwarzamy pochodzenia z tytułów i opisów ani nie migrujemy masowo dawnych stanów.

Odłączenie wymaga jawnego `step.detachEvent: true`. Rezerwacja otrzymuje zaszyfrowane `careContext: null`, odróżniane od braku rozszerzenia w starszym kliencie. Znacznik przechodzi przez odczyt, zwykłą edycję, kopie, pełną synchronizację i delty. Dzięki temu późniejsza edycja samodzielnego wydarzenia nie przywraca powiązania ani nie zmienia odłączonego planu.

Pomijanie dokumentacji planu dotyczy wyłącznie widoku Notatek wraz z jego licznikami i stanem pustym. Nie filtruje wspólnego API sejfu, nie usuwa istniejących wpisów, nie zmienia identyfikatorów, treści, rewizji ani dat i nie wykonuje migracji. Badania, Terminarz, Historia, wyszukiwarka i synchronizacja nadal korzystają z pełnych rekordów. Odnośnik do dokumentacji planu otwiera jej właściwe miejsce zamiast niewidocznego wiersza Notatek. Wpis z brakującym, nieczytelnym lub nieprawidłowym powiązaniem pozostaje dostępny w Notatkach, dopóki nie można bezpiecznie odczytać go przez plan tego samego pacjenta.

Publiczne API sejfu:

- `listCarePlans({patientId?})` — plany konta lub danego pacjenta;
- `getCarePlan(planId)` — aktualny plan;
- `getCarePlanSyncReview(context, title)` — czysta, odczytowa projekcja zachowanych wersji zmian; nie odczytuje magazynu i nie zmienia kontekstu;
- `getCarePlanCalendarRelations(context, title)` / `getCarePlanCalendarRelation(context, title, noteId, stepId)` — odczytowe rozróżnienie bieżącego, historycznego i odłączonego terminu; nie zmienia planu ani wydarzenia;
- `getCarePlanStepOmissions(planId)` — odczytowa ocena bieżących pominięć, dostępności uzasadnień i ochrony przed zmianą przez status wydarzenia;
- `listCarePlanResultCandidates({planId, stepId, query?})` / `getCarePlanResultCandidate({planId, stepId, noteId, linkedRev?, linkedUpdatedAtISO?})` — wybór i świeży podgląd oryginalnego wyniku przed powiązaniem;
- `getCarePlanResultReference({planId, stepId, noteId})` — sprawdzony odczyt oryginału z bieżącego powiązania, przeglądu lub historii;
- `needsCarePlanSyncRepair()` — odczytowe sprawdzenie, czy zapis planu utracił strukturę podczas obsługi przez starszego klienta;
- `mutateCarePlan({planId?, patientId, baseRev, operationId, action, ...})` — zapis, wykonanie, wynik, powiązanie i zamknięcie.

Zmiana porównuje rewizję planu i wszystkich zmienianych wpisów w jednej transakcji. Sprawdza aktualne konto i sesję, obecność pacjenta, usunięcia oraz ponowienie operacji. Błąd zapisu nie może zakończyć kroku bez zapisania wyniku lub kolejnego działania. Eksport/import i synchronizacja przenoszą kontekst w istniejących kopertach notatek. Dotychczasowe operacje na powiązanych notatkach aktualizują plan przez ten sam mechanizm.

`omitStep` przyjmuje `stepId`, `text` i `dateISO`. `linkResult` przyjmuje `stepId`, oryginalne `noteId`, wybraną rewizję `linkedRev`, znacznik `linkedUpdatedAtISO`, jawną datę otrzymania `dateISO` i potwierdzenie `confirmReceived: true`. Świadome wznowienie używa `editStep` z żądaniem `restoreOmitted: true`, uzasadnieniem i datą; zwykła edycja zakończonego kroku zachowuje dotychczasowe ograniczenia. Są to argumenty operacji, a nie nowe pola utrwalonego formatu V1.

Podpinany oryginał jest wyłącznie zależnością odczytu transakcji. Oba adaptery sprawdzają jego pacjenta, kategorię, rewizję, czas aktualizacji, szyfrogram i usunięcia przed pierwszym zapisem planu lub jego wpisów. Oryginał nie trafia do listy zapisów ani powiadomień synchronizacji. Równoległa zmiana lub usunięcie wyniku powoduje konflikt bez częściowego zapisu; formularz zachowuje wpisane wartości i wymaga ponownego sprawdzenia dokumentu przez lekarza.

Równoczesne zmiany tego samego planu na różnych urządzeniach zachowują kroki i przebieg obu gałęzi. Plan oznaczony do przeglądu pokazuje komunikat i wymaga jawnego potwierdzenia przed zamknięciem. Moduł nie rozstrzyga za lekarza sprzecznych ustaleń. Potwierdzenie przeglądu jest osobną operacją z kontrolą rewizji i pozostaje w historii. Po poprawieniu ewentualnych rozbieżności lekarz potwierdza widoczny plan; ta sama transakcja uzgadnia daty i stany jego przypomnień oraz powiązanych wydarzeń. Treść dokumentacji pozostaje zachowana, a niewykonany krok nie oznacza automatycznego odwołania wydarzenia w Terminarzu.

`vilda_care_plans.js` odpowiada za interfejs, `vilda_care_plans.css` za jego style. `vilda_auth_ui.js` montuje moduł w karcie i oknie Przypomnień oraz w Karcie pacjenta. Zasoby są ładowane na stronach z interfejsem sejfu, w obu loaderach i przez precache PWA.

## Synchronizacja między urządzeniami

Plan przechowuje osobno ostatnie 100 odpowiedzi na operacje (`operations`) oraz trwałą wiedzę o pochodzeniu zmian (`causality`). Usunięcie odpowiedzi z krótkiej pamięci ponowień nie usuwa identyfikatora z historii pochodzenia. Sama liczba rewizji, data zapisu lub wspólne operacje z ostatniej setki nie dowodzą, że jedna wersja zawiera drugą. Potwierdzony potomek zastępuje przodka także po długiej pracy bez synchronizacji; ponowne dostarczenie przodka nie otwiera zamkniętego planu ani nie dodaje nowej rewizji.

Pierwszy świadomy zapis starszego planu wyznacza punkt początkowy historii na podstawie skrótu jego dokładnego, znormalizowanego stanu, bez identyfikatora lokalnego konta urządzenia. Sam odczyt nie migruje danych. Scalenie zachowuje pochodzenie znanych kopii i nie tworzy fikcyjnej operacji lekarza. Nie odtwarzamy brakującego pochodzenia z tytułów, dat ani podobieństwa treści. Historia jest częścią zaszyfrowanego kontekstu i przechodzi przez istniejące kopie, eksport/import, pełną synchronizację i delty. Osiągnięcie jej limitu przerywa zapis z komunikatem; historia nie jest po cichu przycinana. Ponowienie operacji znanej wyłącznie z trwałej historii, której odpowiedź już wygasła, wymaga ponownego odczytu zamiast ponownego wykonania lub potwierdzenia nieznanej treści.

Brak wystarczających danych o pochodzeniu jest odróżniany od potwierdzonej równoległej edycji. Oba przypadki zachowują dostępne kroki i ustalenia oraz wymagają przeglądu. Niepotwierdzone pochodzenie nie wznawia samoczynnie zamkniętego planu. Zadanie „Przejrzyj plan po synchronizacji” pozostaje dostępne w „Do wykonania” także dla zamkniętego planu. Jeżeli zachowano w nim otwarte kroki, lekarz jawnie wznawia plan albo potwierdza ich zakończenie bez wykonania z uzasadnieniem. Samo potwierdzenie przeglądu nie może ukryć nierozstrzygniętej pracy. Powiązane rezerwacje pozostają w Terminarzu. Zachowane wersje można rozwinąć w podglądzie przeglądu, wraz z datami, godzinami i odnośnikami do oryginalnych dokumentów. Potwierdzenie zachowuje rozstrzygnięte wersje w historii planu; nie tworzy kopii wyników ani ponownych Notatek pacjenta.

Plan i jego powiązane wpisy mają osobne zaszyfrowane delty. Większy plan może przekroczyć łączny limit 64 KiB kanału `sendBeacon`, mimo że krótkie notatki kroków przejdą. `vilda_sync_integration.js` po odrzuceniu lub wyjątku beacona wysyła tę samą zaszyfrowaną deltę zwykłym `fetch`, bez limitu `keepalive`. Prawidłowo przyjętego beacona nie wysyła ponownie.

Nieprawidłowa lub przekraczająca limit historia pochodzenia przerywa przyjęcie delty. Synchronizacja zachowuje kursor przed nieprzyjętą zmianą i nie stosuje późniejszych delt z tej partii. Istniejąca obsługa błędów pokazuje kod i komunikat problemu; następna próba może ponownie pobrać tę samą zmianę. Sukces sprawdzenia głównej kopii w chmurze nie usuwa późniejszego błędu pobierania delt.

Klient sprzed wprowadzenia planów pomijał nieznane `careContext`, zachowując identyfikator, tekst i wersję notatki. Po aktualizacji równy numer rewizji i data nie mogą blokować odzyskania samego brakującego rozszerzenia. Sejf uzupełnia je pod blokadą wpisu, wyłącznie gdy pozostała treść i metadane zgadzają się z nienaruszoną kopią. Zachowuje rewizję, daty, treść kliniczną i nieznane pola zaszyfrowanego zapisu. Obejmuje to także role powiązanych wpisów, aby nie zamieniły się w niezależne przypomnienia lub podwójne wydarzenia.

Jeżeli telefon zna już ten sam ETag chmury, `vilda_sync.js` wykrywa brak struktury i jednokrotnie ponawia pełny odczyt tego bloba. Nieudany odczyt lub scalenie pozostają do ponowienia. Równoległe odczyty w jednym dokumencie współdzielą próbę. Poprawny wynik braku luki jest zapamiętany do zmiany notatek, sesji lub ETagu; zwykłe sprawdzanie synchronizacji nie odszyfrowuje planów przy każdym odpytaniu.

Odzyskanie wymaga nienaruszonej struktury w chmurze lub na drugim urządzeniu. Nie rekonstruujemy decyzji lekarza z luźnych notatek, nie cofamy rzeczywistej późniejszej edycji i nie nadpisujemy istniejącego kontekstu. Wszystkie urządzenia powinny używać bieżącej wersji aplikacji; starszy klient nadal nie zna struktury planu.

## Podstawa etapów — odczyt bez migracji

`vilda_care_plan_model.js` jest czystym, wersjonowanym kodekiem i projekcją danych. Nie odczytuje zegara, DOM, magazynu ani sieci. Jest ładowany przed sejfem na stronach z kontem oraz przez oba loadery i precache. Dotychczasowy interfejs nadal używa API i zapisu V1; kreator, biblioteka szablonów oraz zapis V2 nie są jeszcze uruchomione.

Nowe API `VildaVault.getCarePlanView(planId, {todayLocalDateISO?})` odczytuje zaszyfrowany oryginał i tworzy odłączony widok. Sprawdza konto, sesję i adapter po operacjach asynchronicznych. Dzień przekazany do projekcji służy tylko etykietom przypomnień. Odczyt nie zmienia kontekstu, szyfrogramu, rewizji, historii, stanu zapisu pacjenta ani kolejki synchronizacji. Przy znacznikach usunięcia wykorzystuje istniejące reguły wyboru żywego rekordu i retencji; sam nie wykonuje odzyskania, przeniesienia ani czyszczenia danych.

V1 otrzymuje wyłącznie wirtualną grupę „Dotychczasowy plan”, z kluczem widoku zamiast zapisanego identyfikatora etapu. Zachowuje oryginalne identyfikatory, równoległe kroki, bezwzględne daty i godziny, odnośniki oraz historię. Dawne `done` nie tworzy nowego faktu wykonania, otrzymania wyniku ani decyzji. Zapisane pochodzenie pozostaje widoczne jako zastane dane; brakujące pochodzenie pozostaje nieznane. Nazwy podobnych kroków nie są podstawą ich łączenia. Normalizacja i zobowiązania SHA V1 pozostają bez zmian.

Uśpiony odczyt V2 rozdziela:

- sterowanie etapem `planned` / `active` / `reviewed` od faktów `performance` / `resultReceipt` / `decision`;
- faktyczny dzień zdarzenia od technicznego czasu jego zapisania;
- powiązanie z oryginalnym wynikiem lub rezerwacją od własności i treści tego oryginału;
- gotowość do przeglądu od świadomego zatwierdzenia oraz od osobnego uruchomienia następnego etapu.

Wynik powiązany z przyszłym etapem nie uruchamia go i nie tworzy przypomnień. Powiązanie wyniku i terminu jest niezależne od kolejności tych czynności. Aktywna nierozstrzygnięta praca bez terminu jest obecna w projekcji z `dueDateISO: null`, bez oznaczenia zaległości. Przyszłe nieuruchomione kroki nie zasilają bieżącej pracy. Po ostatnim zatwierdzeniu otwarty plan wymaga osobnej decyzji o dalszym postępowaniu; nie zamyka się automatycznie.

Pierwszy model przypomnienia obsługuje brak terminu albo przesunięcie o dni, tygodnie lub miesiące od jawnej daty ręcznego uruchomienia etapu. Arytmetyka jest kalendarzowa, niezależna od strefy czasowej i zmiany czasu. Koniec miesiąca jest ograniczany w miesiącu docelowym: 31.01 + 1 miesiąc daje 28/29.02, a + 2 miesiące daje 31.03. Odczyt reguły nie utrwala żadnej daty ani nie przesuwa wizyty.

Każdy nowy widok jest `readOnly: true`, `provenanceVerified: false`. Walidacja struktury nie jest weryfikacją kryptograficznego pochodzenia. `VildaCarePlanModel.getWriteCapability()` i `VildaVault.getCarePlanWriteCapability()` zwracają stałe niedostępne uprawnienie `CARE_V2_WRITER_DISABLED`; argument wywołującego nie może włączyć zapisu. Niepuste korekty faktów oraz zapisany etap legacy V2 są na tym etapie jawnie nieobsługiwane, zamiast być interpretowane przez zgadywanie. Obsługa zmian zatwierdzonych etapów i promocji starych planów pozostaje zadaniem kolejnych etapów wdrożenia. Przekroczenie budżetu samej projekcji zwraca osobny stan `limited` z `CARE_MODEL_JSON_LIMIT`; nie zmienia formatu na nieobsługiwany i nie zwraca przyciętych danych. Oryginał oraz dotychczasowe API V1 pozostają zachowane.

Nieobsługiwany `careContext` jest jawnie rozpoznawany. Nowy odczyt udostępnia bezpieczny widok tylko do odczytu; starsze ścieżki zapisu i transportu zgłaszają `CARE_FORMAT_UNSUPPORTED`, zamiast usuwać nieznane pola albo zwracać pozornie pustą dokumentację. Preflight sprawdza całą paczkę wejściową przed jej zapisem. Istniejący rekord jest sprawdzany podczas już potrzebnego odczytu, przed jego zmianą, usunięciem albo odnowieniem; kolejność i koszt zwykłych odczytów V1 pozostają zachowane. Operacje złożone zachowują dotychczasową wieloetapowość: po błędzie dotyczącym istniejącego rekordu wcześniejsze legalne zmiany innych rekordów mogą pozostać zapisane, a chroniony rekord pozostaje zachowany. Zatrzymany transport zachowuje kursor i pokazuje błąd przez istniejącą diagnostykę. Migracja w tle zatrzymana na takim rekordzie zachowuje jego szyfrogram, pozostawia flagę ukończenia nieustawioną i zapisuje komunikat diagnostyczny; wcześniejsze prawidłowe kroki migracji mogą być już wykonane.

To zabezpieczenie rekordów nie jest jeszcze globalną blokadą starszych klientów. Przed aktywacją V2 konieczny jest osobno sprawdzony most zgodności: ochrona lokalnego formatu i otwartych kart, pełny bootstrap tożsamości, chroniona przestrzeń synchronizacji z trwałą polityką i epoką, kontrola importu oraz rzeczywiste testy dawnych klientów i dozwolonych wersji serwera. Tryby chmurowy i jednorazowy wymagają także dowodu bezpieczeństwa ich cache i czyszczenia sesji. Ten etap nie podnosi wersji IndexedDB, nie zmienia kopert plików, nie migruje kont i nie wdraża serwera.

## Walidacja

Testy `care-plans-vault.test.mjs` wywołują rzeczywisty sejf i sprawdzają atomowość, konflikt edycji, usunięcie, zmianę konta/sesji, ponowienie, integrację Terminarza oraz transport kontekstu przez kopie i synchronizację. Testy `care-plans*.spec.mjs` sprawdzają pełny interfejs, mobilną nawigację, powłokę aplikacji i zimny start offline. Dane testowe są wyłącznie fikcyjne.

Regresje synchronizacji obejmują duży zaszyfrowany plan przy odrzuconym beaconie, odzyskanie wszystkich ról przy niezmienionej wersji, ochronę zmienionej treści i usunięć oraz pełne odczyty przy tym samym ETagu. `care-plans-sync.spec.mjs` używa osobnych kontekstów komputera i telefonu ze wspólną fikcyjną tożsamością szyfrowania, rzeczywistych modułów synchronizacji i lokalnie przechwyconego serwera. Sprawdza wymianę delty w obie strony, odświeżenie już otwartej listy i odzysk po aktualizacji/F5.

Regresje przepływu sprawdzają odłączenie bez utraty rezerwacji, zachowanie klinicznych faktów przy zmianach Terminarza, daty faktów i przyszłe planowanie, rozróżnianie pacjentów oraz wyszukiwanie opisu wydarzenia. Scenariusz zimnego startu offline sprawdza także utrwalenie pochodzenia otrzymanego wyniku i jawnego odłączenia rezerwacji po ponownym wczytaniu z produkcyjnego cache.

Testy pochodzenia zmian obejmują 99–200 operacji, trzy urządzenia, różne kolejności scalania, ponowienia po przeglądzie, niezgodne wartości i historię oraz zmianę konta, sesji i magazynu. Test rzeczywistej pętli `/changes` sprawdza zatrzymanie kursora, widoczny błąd i ponowne przyjęcie tej samej zaszyfrowanej delty. Zgodność tekstowej historii jest sprawdzana na rzeczywistym poprzednim `vilda_vault.js` z przypiętego commita `b461364002cbd3f652728b7db38dce0f1f0d9264`; przygotowanie CI zapewnia ten obiekt Git bez dostępu do sieci z samego testu. Starszy klient nie odtwarza nowych metadanych, ale zachowuje czytelne ustalenia i odnośniki do oryginalnych dokumentów.

MVP nie obejmuje automatycznych szablonów diagnostycznych, wymagań zależnych między krokami, pracy zespołowej, importu dokumentów ani dodatkowych kanałów powiadomień.
