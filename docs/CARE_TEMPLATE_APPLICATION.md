# Użycie szablonu w planie pacjenta

Zmiana dodaje użycie własnego szablonu w `Przypomnienia → Plany opieki → Moje szablony` oraz w Planach opieki w Karcie pacjenta. Przy tworzeniu planu dostępne są opcje **Pusty plan** i **Szablon**.

## Przebieg

1. Przy szablonie lub w jego podglądzie wybierz **Użyj u pacjenta**.
2. W Przypomnieniach wybierz pacjenta. W Karcie pacjenta odbiorca jest już ustalony.
3. Sprawdź nazwę, cel, etapy i kroki. Możesz zmienić treść i wyłączyć niepotrzebne kroki przed zapisem. Etap pozbawiony wszystkich kroków nie trafia do kopii.
4. Utwórz plan. Zapisana kopia ma własne identyfikatory i zachowuje wersję źródłowego szablonu. Późniejsza edycja szablonu nie zmienia planu pacjenta.
5. Uruchom pierwszy etap świadomie. Utworzenie planu samo nie uruchamia przypomnień. Kolejne etapy również wymagają działania lekarza.

Wykonanie czynności, otrzymanie wyniku i decyzja to odrębne rodzaje informacji. Aplikacja nie uznaje wykonanego badania za otrzymany wynik. Fakty, ich daty oraz powiązania z dokumentacją są zachowane razem z planem. Zamknięcie lub pominięcie pracy nie tworzy fikcyjnego wykonania.

## Szablon przekazany przez innego lekarza

[Import pojedynczego szablonu](CARE_TEMPLATE_TRANSFER.md) tworzy niezależną kopię w „Moich szablonach”. Po sprawdzeniu treści można zastosować ją u pacjenta tą samą drogą co własny szablon. Informacje o autorstwie, źródłach, warunkach udostępniania i pochodzeniu opracowania pozostają zachowane w zapisanej wersji i jej kopii w planie. Import nie zmienia istniejących planów ani dokumentacji pacjenta; późniejsza zmiana szablonu również nie aktualizuje tych planów automatycznie.

Kopia `.wiw` przenosi stan planu zapisanego w dokumentacji pacjenta, lecz **obecnie nie jest kopią oddzielnej biblioteki szablonów**. Dodanie całej biblioteki do przyszłej `.wiw` jest zapisanym zadaniem [P-WIW-TEMPLATE-LIBRARY](TEMPLATE_LIBRARY_BACKUP_PLAN.md), poza zakresem transferu pojedynczego szablonu.

## Zapis i dokumentacja

Plan, jego dokumentacja i przypomnienia są zatwierdzane jako jedna operacja. Utrata odpowiedzi nie powoduje utworzenia drugiej kopii przy ponowieniu tej samej operacji. Potwierdzenie tej operacji oznacza trwały zapis lokalny; przesłanie danych pokazuje dotychczasowy ogólny stan synchronizacji konta. Zwykły plan nie ma osobnego potwierdzenia serwerowego. Konflikt dwóch urządzeń wymaga uzgodnienia; nie jest rozstrzygany na podstawie ostatniej daty.

Nowe plany są widoczne w Planach opieki i wyszukiwaniu. Dokumentacja pozostaje dostępna w Notatkach; odnośnik prowadzi do odpowiedniego planu. Nieczytelne lub osierocone powiązanie nie ukrywa wpisu. Ogólny edytor notatek nie może ominąć zasad zapisu faktu należącego do planu.

Powiązanie z wcześniej istniejącą notatką zapisuje identyfikator i wersję źródła, bez archiwizowania jego treści z chwili powiązania. Jeśli później zmieni się wersja notatki, widok dowodu wyjaśnia rozbieżność i nie przedstawia bieżącej treści jako historycznego potwierdzenia. Fakt i historia planu pozostają zachowane, a bieżąca notatka jest dostępna w dokumentacji pacjenta.

## Zapis bez przygotowywania konta

Zwykłe konto korzysta z dotychczasowego sejfu, synchronizacji i kopii `.wiw`. Użycie szablonu nie przygotowuje ani nie przełącza całej dokumentacji i nie wymaga nowej usługi serwerowej. Automatyczne kopie zachowują dotychczasową konfigurację i dostępność.

Pełny stan konkretnego planu — źródłowy szablon, etapy, fakty, identyfikatory dokumentów i historia operacji — znajduje się w wersjonowanym rozszerzeniu jego zaszyfrowanej notatki. Plan i powiązane dokumenty są zapisywane przez istniejącą transakcję IndexedDB, ze sprawdzeniem wersji oraz zależności odczytu. Potwierdzenie zapisu następuje po `transaction.oncomplete`. Synchronizacja i odtwarzanie kopii przenoszą cały stan, a nie tylko jego widok.

Nieuruchomione i zakończone kroki nie tworzą fikcyjnych wykonań. Nieaktywne wygenerowane przypomnienie pozostaje zaszyfrowaną projekcją techniczną, ukrytą na listach użytkownika; jego ponowne uruchomienie nie odtwarza rzeczywiście usuniętego dokumentu.

Przypomnienia, Terminarz i wyszukiwanie odczytują aktywną pracę z pełnego stanu planu. Opóźnione przesłanie wygenerowanego wpisu nie może przywrócić rozwiązanego kroku ani cofnąć jego terminu. Ten odczyt nie zapisuje zastępczych dokumentów ani fikcyjnych wykonań. Destrukcyjne zmiany synchronizacji dotyczące planu, jego pacjenta lub dokumentacji są sprawdzane przed rozpoczęciem zapisu ładunku.

Zmiany stanowiące ścisłą kontynuację tej samej historii synchronizują się zwykłą drogą. Przy rozbieżnych historiach zachowane są kompletne wersje oraz ich dokumentacja. Widok planu pokazuje obie kopie i blokuje edycję niejednoznacznego planu. Nie skleja automatycznie faktów klinicznych ani nie uznaje późniejszej daty za rozstrzygnięcie. Ten wariant nie udostępnia jeszcze semantycznego uzgadniania rozbieżnych historii; kopie pozostają dostępne w planie i backupie.

Ogólny edytor, wykonanie przypomnienia i usuwanie wpisu nie mogą ominąć kontroli dokumentacji powiązanej z planem. Łączenie lub usuwanie karty zawierającej plan etapowy pozostaje blokowane do czasu zaprojektowania jawnego przeniesienia całej historii i powiązań. Zwykłe karty bez takich planów zachowują dotychczasowe zachowanie.

Konta, które wcześniej rzeczywiście uruchomiły chroniony zapis całej dokumentacji, nadal używają jego własnego odczytu, synchronizacji i odzyskiwania. Ta poprawka nie przenosi ich danych z powrotem. Częściowo przygotowany, lecz nieuruchomiony zapis pozostaje nienaruszony i nie blokuje zwykłego przypisywania szablonu. Interfejs szablonów nie oferuje przygotowywania konta; zgodność ze starszymi klientami odzyskiwania jest oddzielona od normalnego przebiegu.

## Źródła i dowody

Modele i interfejs znajdują się w czytelnych plikach `vilda_care_template_model.js`, `vilda_care_plan_mutation.js`, `vilda_care_templates.js` i `vilda_care_plans.js`. Źródła zapisu, odzyskiwania i synchronizacji są utrzymywane w prywatnym `vilda-source/client/patient-clinical-workspace*`.

`tools/build-clinical-workspace-runtime.mjs` w repozytorium źródeł składa przypięty artefakt sejfu z czytelnym modułem integracji. `runtime/clinical-workspace-v1/manifest.json` zawiera skróty kompletu modułów oraz sejfu przed i po integracji. Publiczny `tools/check_clinical_workspace_boundary.mjs` sprawdza odwrócenie dokładnych zmian do bieżącej wersji bazowej, bajt w bajt. Rozpoznaje wyłącznie kompletny, oznaczony format przenośny. Nie traktuje dawnych odnośników V2 bez pełnego stanu ani przyszłych wersji jako zwykłych planów.

Integracja sejfu jest przypięta do bazowego commita `c8d8442e26ac870fc5764408be8e81976eddde3b` (#905) z późniejszymi zmianami sejfu poza fragmentem natywnym: E2-PR3a2 (#912), poprawką scalania planów P-PLAN-POTOMEK (#913, przewinięcie do potomka bez nowej rewizji), E2-PR3a3 (importy partią w dzienniku zdarzeń), E2-PR3a4 (przegląd kolejki dziennika zdarzeń), E2-PR3b (haki scalania w dzienniku zdarzeń), E2-PR3c1 (zdarzenie usunięcia karty po „Scal pacjentów” niesie kartę scaloną), E2-PR3c2 (poprawka albo gwiazdka wizyty ze starej karty na urządzeniu, które scaliło karty) E2-PR3c3 („Zostaw notatkę” na dwóch urządzeniach — numer nagrobka i chwila utworzenia notatki) i E2-PR3c4 (notatka i plan opieki po „Scal pacjentów” za kartą, która istnieje); wszystkie opisuje `docs/clinical/ALGORITHMS.md`. Skrót tej bazy zapisują `tools/check_clinical_workspace_boundary.mjs` i `runtime/clinical-workspace-v1/manifest.json`; budowniczy w repozytorium źródeł wymaga tego samego przypięcia. Odczyt listy kont zachowuje dotychczasową semantykę podczas równoczesnego usuwania konta. Dokończenie przerwanego usuwania korzysta z tej samej kontroli chronionego zapisu co jawne usunięcie; nie omija ochrony zachowanej dokumentacji.

Pierwsze pokazanie logowania bez danych pacjenta nie uruchamia zbędnego czyszczenia formularza. Nieudane odtworzenie sesji chmurowej lub zachowanych danych pacjenta, jawny powrót do logowania oraz blokada już otwartej sesji zachowują czyszczenie. Potrzeba czyszczenia jest sprawdzana przed odtworzeniem, również wtedy, gdy odtworzenie usuwa wygasły klucz i znacznik trybu chmurowego.

Instalacja offline pobiera moduły w jednym archiwum transportowym i sprawdza jego skrót oraz każdy moduł przed zapisem w pamięci. Moduły zachowują oryginalne adresy i treść. Limit liczby pobrań instalacji pozostaje bez zmian.

Testy obejmują modele etapów, UI i nawigację, rzeczywiste transakcje IndexedDB, lokalny silnik usługi oraz przeglądarkowy przebieg na fikcyjnych kontach. Dokładny zestaw wyników i SHA wydania zapisuje opis PR. Obliczenia, normy i interpretacje kliniczne nie są zmieniane przez tę funkcję.
