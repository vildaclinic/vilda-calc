# Plany opieki — MVP

Plany opieki są zakładką Przypomnień i Karty pacjenta. Jeden pacjent może mieć kilka planów, a plan — kilka równolegle otwartych kroków. Kroki i decyzje wpisuje lekarz; moduł nie narzuca schematów diagnostyki, kwalifikacji do leczenia ani terminów kontroli.

## Zachowanie

- Dotychczasowe Przypomnienia zachowują kwalifikację do końca bieżącego lokalnego dnia. Przyszłe kroki i kroki bez daty są dostępne w planach. Samodzielne przypomnienie nie wymaga planu; przy dodawaniu można wskazać otwarty plan wybranego pacjenta.
- Termin wydarzenia, dzień przypomnienia/sprawdzenia wyniku i data rzeczywistego wykonania/otrzymania są osobne. Dołączenie istniejącego terminu zachowuje jego identyfikator.
- Zapis wykonania lub wyniku kończy wybrany krok. Lekarz pozostawia pozostałe kroki, dodaje kolejny albo ustala dzień powrotu do decyzji. Plan pozostaje otwarty.
- Wynik opisowy trafia do Notatek i Badań Karty pacjenta. Nie jest przeliczany na wynik liczbowy; data otrzymania nie staje się datą pobrania próbki. Główne Notatki pozostają biblioteką szablonów lekarza.
- Zamknięcie wymaga powodu i opisu. Otwarte kroki wymagają jawnej zgody na zakończenie bez wykonania. Powiązane wydarzenia pozostają w Terminarzu; zamknięcie planu nie odwołuje ich automatycznie. Wznowienie zachowuje historię i wykonane kroki.
- Na telefonie obowiązuje lista → szczegóły → powrót do zachowanej pozycji. Nie dodajemy pośredniego przycisku pełnego ekranu.

## Zapis i integracje

`vilda_vault.js` przechowuje plan jako notatkę pacjenta kategorii `care-plan`. Wersjonowany `careContext` jest częścią zaszyfrowanej treści, razem z listą kroków, historią i identyfikatorami operacji. Nie powstaje nowy magazyn bazy ani jawny zapis planów w localStorage. Zewnętrzny `patientId` pozostaje jedynym właścicielem rekordu; kontekst nie utrwala jego osobnej kopii.

Powiązane notatki mają role `step`, `decision`, `calendar`, `result` lub `note`. Pomocniczy rekord kroku/decyzji zasila Przypomnienia. Faktyczne wydarzenie zasila Terminarz. Rozdzielenie tych ról zapobiega podwójnym wydarzeniom przy różnych dniach badania i przypomnienia. Techniczne rekordy planu i kroków nie są edytowane przez ogólny edytor Notatek pacjenta; właściwe wyniki i ustalenia pozostają widoczne w kartotece.

Publiczne API sejfu:

- `listCarePlans({patientId?})` — plany konta lub danego pacjenta;
- `getCarePlan(planId)` — aktualny plan;
- `needsCarePlanSyncRepair()` — odczytowe sprawdzenie, czy zapis planu utracił strukturę podczas obsługi przez starszego klienta;
- `mutateCarePlan({planId?, patientId, baseRev, operationId, action, ...})` — zapis, wykonanie, wynik, powiązanie i zamknięcie.

Zmiana porównuje rewizję planu i wszystkich zmienianych wpisów w jednej transakcji. Sprawdza aktualne konto i sesję, obecność pacjenta, usunięcia oraz ponowienie operacji. Błąd zapisu nie może zakończyć kroku bez zapisania wyniku lub kolejnego działania. Eksport/import i synchronizacja przenoszą kontekst w istniejących kopertach notatek. Dotychczasowe operacje na powiązanych notatkach aktualizują plan przez ten sam mechanizm.

Równoczesne zmiany tego samego planu na różnych urządzeniach zachowują kroki i przebieg obu gałęzi. Plan oznaczony do przeglądu pokazuje komunikat i wymaga jawnego potwierdzenia przed zamknięciem. Moduł nie rozstrzyga za lekarza sprzecznych ustaleń. Potwierdzenie przeglądu jest osobną operacją z kontrolą rewizji i pozostaje w historii. Po poprawieniu ewentualnych rozbieżności lekarz potwierdza widoczny plan; ta sama transakcja uzgadnia daty i stany jego przypomnień oraz powiązanych wydarzeń. Treść dokumentacji pozostaje zachowana, a niewykonany krok nie oznacza automatycznego odwołania wydarzenia w Terminarzu.

`vilda_care_plans.js` odpowiada za interfejs, `vilda_care_plans.css` za jego style. `vilda_auth_ui.js` montuje moduł w karcie i oknie Przypomnień oraz w Karcie pacjenta. Zasoby są ładowane na stronach z interfejsem sejfu, w obu loaderach i przez precache PWA.

## Synchronizacja między urządzeniami

Plan i jego powiązane wpisy mają osobne zaszyfrowane delty. Większy plan może przekroczyć łączny limit 64 KiB kanału `sendBeacon`, mimo że krótkie notatki kroków przejdą. `vilda_sync_integration.js` po odrzuceniu lub wyjątku beacona wysyła tę samą zaszyfrowaną deltę zwykłym `fetch`, bez limitu `keepalive`. Prawidłowo przyjętego beacona nie wysyła ponownie.

Klient sprzed wprowadzenia planów pomijał nieznane `careContext`, zachowując identyfikator, tekst i wersję notatki. Po aktualizacji równy numer rewizji i data nie mogą blokować odzyskania samego brakującego rozszerzenia. Sejf uzupełnia je pod blokadą wpisu, wyłącznie gdy pozostała treść i metadane zgadzają się z nienaruszoną kopią. Zachowuje rewizję, daty, treść kliniczną i nieznane pola zaszyfrowanego zapisu. Obejmuje to także role powiązanych wpisów, aby nie zamieniły się w niezależne przypomnienia lub podwójne wydarzenia.

Jeżeli telefon zna już ten sam ETag chmury, `vilda_sync.js` wykrywa brak struktury i jednokrotnie ponawia pełny odczyt tego bloba. Nieudany odczyt lub scalenie pozostają do ponowienia. Równoległe odczyty w jednym dokumencie współdzielą próbę. Poprawny wynik braku luki jest zapamiętany do zmiany notatek, sesji lub ETagu; zwykłe sprawdzanie synchronizacji nie odszyfrowuje planów przy każdym odpytaniu.

Odzyskanie wymaga nienaruszonej struktury w chmurze lub na drugim urządzeniu. Nie rekonstruujemy decyzji lekarza z luźnych notatek, nie cofamy rzeczywistej późniejszej edycji i nie nadpisujemy istniejącego kontekstu. Wszystkie urządzenia powinny używać bieżącej wersji aplikacji; starszy klient nadal nie zna struktury planu.

## Walidacja

Testy `care-plans-vault.test.mjs` wywołują rzeczywisty sejf i sprawdzają atomowość, konflikt edycji, usunięcie, zmianę konta/sesji, ponowienie, integrację Terminarza oraz transport kontekstu przez kopie i synchronizację. Testy `care-plans*.spec.mjs` sprawdzają pełny interfejs, mobilną nawigację, powłokę aplikacji i zimny start offline. Dane testowe są wyłącznie fikcyjne.

Regresje synchronizacji obejmują duży zaszyfrowany plan przy odrzuconym beaconie, odzyskanie wszystkich ról przy niezmienionej wersji, ochronę zmienionej treści i usunięć oraz pełne odczyty przy tym samym ETagu. `care-plans-sync.spec.mjs` używa osobnych kontekstów komputera i telefonu ze wspólną fikcyjną tożsamością szyfrowania, rzeczywistych modułów synchronizacji i lokalnie przechwyconego serwera. Sprawdza wymianę delty w obie strony, odświeżenie już otwartej listy i odzysk po aktualizacji/F5.

MVP nie obejmuje automatycznych szablonów diagnostycznych, wymagań zależnych między krokami, pracy zespołowej, importu dokumentów ani dodatkowych kanałów powiadomień.
