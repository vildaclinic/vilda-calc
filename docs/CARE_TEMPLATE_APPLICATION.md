# Użycie szablonu w planie pacjenta

Zmiana dodaje użycie własnego szablonu w `Przypomnienia → Plany opieki → Moje szablony` oraz w Planach opieki w Karcie pacjenta. Przy tworzeniu planu dostępne są opcje **Pusty plan** i **Szablon**.

## Przebieg

1. Przy szablonie lub w jego podglądzie wybierz **Użyj u pacjenta**.
2. W Przypomnieniach wybierz pacjenta. W Karcie pacjenta odbiorca jest już ustalony.
3. Sprawdź nazwę, cel, etapy i kroki. Możesz zmienić treść i wyłączyć niepotrzebne kroki przed zapisem. Etap pozbawiony wszystkich kroków nie trafia do kopii.
4. Utwórz plan. Zapisana kopia ma własne identyfikatory i zachowuje wersję źródłowego szablonu. Późniejsza edycja szablonu nie zmienia planu pacjenta.
5. Uruchom pierwszy etap świadomie. Utworzenie planu samo nie uruchamia przypomnień. Kolejne etapy również wymagają działania lekarza.

Wykonanie czynności, otrzymanie wyniku i decyzja to odrębne rodzaje informacji. Aplikacja nie uznaje wykonanego badania za otrzymany wynik. Fakty, ich daty oraz powiązania z dokumentacją są zachowane razem z planem. Zamknięcie lub pominięcie pracy nie tworzy fikcyjnego wykonania.

## Zapis i dokumentacja

Plan, jego dokumentacja i przypomnienia są zatwierdzane jako jedna operacja. Utrata odpowiedzi nie powoduje utworzenia drugiej kopii przy ponowieniu tej samej operacji. Stan oczekującej synchronizacji jest odróżniony od potwierdzonego zapisu na serwerze. Konflikt dwóch urządzeń wymaga uzgodnienia; nie jest rozstrzygany na podstawie ostatniej daty.

Nowe plany są widoczne w Planach opieki i wyszukiwaniu. Dokumentacja pozostaje dostępna w Notatkach; odnośnik prowadzi do odpowiedniego planu. Nieczytelne lub osierocone powiązanie nie ukrywa wpisu. Ogólny edytor notatek nie może ominąć zasad zapisu faktu należącego do planu.

## Uruchomienie i zgodność

Etapy korzystają z osobnego chronionego zapisu całej dokumentacji pacjentów. Przygotowanie odbywa się jawnie, wraz z kopią bezpieczeństwa i kodem odzyskiwania. Sam odczyt biblioteki nie uruchamia migracji. Dotychczasowe plany pozostają w swoim formacie; nie są automatycznie zamieniane na plany z etapami.

Wdrożenie frontendu wymaga zgodnej wersji usługi synchronizacji. Nowe funkcje usługi mają domyślnie wyłączone flagi. Scalenie samego frontendu nie stanowi wdrożenia ani włączenia tej usługi. Do przygotowania chronionego zapisu potrzebny jest prywatny lokalny tryb konta i przeglądarka obsługująca wymagane mechanizmy trwałego zapisu. Brak możliwości przygotowania ma być przedstawiony jako niedostępność, bez pozornego utworzenia planu.

W Ustawieniach, w sekcji Kopie, dostępna jest pełna kopia dokumentacji pacjentów i jej odtworzenie na pustym koncie. Obejmuje ona oczekujące zmiany i zachowane rozbieżne wersje. Biblioteka własnych szablonów ma oddzielny eksport. Odtworzenie nie nadpisuje istniejącej dokumentacji innego konta. Uzgadnianie rozbieżnych wersji jest osobną, jawną czynnością poprzedzoną kopią obu wersji.

Po włączeniu chronionego zapisu dotychczasowa automatyczna kopia `.wiw` jest niedostępna; ustawienia pokazują ten stan i prowadzą do ręcznej pełnej kopii. Nie wolno traktować wcześniejszego folderu automatycznych kopii jako zabezpieczenia nowych planów. Łączenie lub usuwanie pacjenta z planem etapowym jest obecnie blokowane z wyjaśnieniem.

Jeśli starsza wersja aplikacji zmieni pozostawioną bazę lokalną, dalszy zapis, synchronizacja i pełny eksport są wstrzymywane. Obie bazy pozostają zachowane. Aplikacja nie uzgadnia takiej rozbieżności automatycznie i nie przedstawia kopii nowego zapisu jako obejmującej późniejsze zmiany ze starej bazy.

Pojemność chronionego zapisu jest ograniczona: źródło do 128 MiB, zachowane szyfrogramy i metadane do 512 MiB oraz do 4096 operacji. Niezmienione fragmenty danych są współdzielone między wersjami. Historia nie jest usuwana automatycznie, a osiągnięcie limitu zatrzymuje kolejne zapisy zamiast przycinać dokumentację. Oczekujące zmiany nie otrzymują wtedy statusu zsynchronizowanych.

## Źródła i dowody

Modele i interfejs znajdują się w czytelnych plikach `vilda_care_template_model.js`, `vilda_care_plan_mutation.js`, `vilda_care_templates.js` i `vilda_care_plans.js`. Źródła zapisu, odzyskiwania i synchronizacji są utrzymywane w prywatnym `vilda-source/client/patient-clinical-workspace*`.

`tools/build-clinical-workspace-runtime.mjs` w repozytorium źródeł składa przypięty artefakt sejfu z czytelnym modułem integracji. `runtime/clinical-workspace-v1/manifest.json` zawiera skróty kompletu modułów oraz sejfu przed i po integracji. Publiczny `tools/check_clinical_workspace_boundary.mjs` sprawdza odwrócenie dokładnych zmian do bieżącej wersji bazowej, bajt w bajt. Nie nadaje nowych uprawnień staremu zapisowi V2 ani nie zmienia wcześniejszych zabezpieczeń formatu.

Integracja sejfu jest przypięta do bazowego commita `c8d8442e26ac870fc5764408be8e81976eddde3b` (#905). Odczyt listy kont zachowuje dotychczasową semantykę podczas równoczesnego usuwania konta. Dokończenie przerwanego usuwania korzysta z tej samej kontroli chronionego zapisu co jawne usunięcie; nie omija ochrony zachowanej dokumentacji.

Pierwsze pokazanie logowania bez danych pacjenta nie uruchamia zbędnego czyszczenia formularza. Nieudane odtworzenie sesji chmurowej lub zachowanych danych pacjenta, jawny powrót do logowania oraz blokada już otwartej sesji zachowują czyszczenie. Potrzeba czyszczenia jest sprawdzana przed odtworzeniem, również wtedy, gdy odtworzenie usuwa wygasły klucz i znacznik trybu chmurowego.

Instalacja offline pobiera moduły w jednym archiwum transportowym i sprawdza jego skrót oraz każdy moduł przed zapisem w pamięci. Moduły zachowują oryginalne adresy i treść. Limit liczby pobrań instalacji pozostaje bez zmian.

Testy obejmują modele etapów, UI i nawigację, rzeczywiste transakcje IndexedDB, lokalny silnik usługi oraz przeglądarkowy przebieg na fikcyjnych kontach. Dokładny zestaw wyników i SHA wydania zapisuje opis PR. Obliczenia, normy i interpretacje kliniczne nie są zmieniane przez tę funkcję.
