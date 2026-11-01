# Chroniona domena danych pacjentów — etap 6a

Etap 6 obejmuje utworzenie niezależnego planu pacjenta z wybranej wersji szablonu oraz ręczną obsługę etapów tego planu. Etap 6a przygotowuje kontrakt zgodności i wybór kanału danych. Nie uruchamia zapisu planów V2 ani przycisku zastosowania szablonu.

## Właściciel danych i protokół

Wybrana domena obejmuje cały kliniczny sejf: oryginalne dane pacjentów, dokumentację, wydarzenia oraz transakcje planów opieki. Biblioteka definicji szablonów pozostaje osobną domeną konta. Rozdzielenie samych planów od ich dokumentów wymagałoby dodatkowego protokołu transakcji między domenami.

Kontrakt ma nazwę `patient-clinical-vault`, protokół `1` i format danych `vilda-clinical-vault/v2`. Odpowiedź biblioteki `care-template-library`, raport zdrowia serwera ani odszyfrowanie kluczem danych nie są dowodem obsługi tej domeny.

Metadane stanu zawierają wyłącznie: `ok`, `namespace`, `protocol`, `slotId`, `authorityId`, `keyBinding`, `initialized`, `epoch`, `formatFloor`, `headSeq`, `floorSeq` i `manifest`. Identyfikator slotu i powiązanie klucza mają po 64 małe cyfry szesnastkowe. Identyfikator autorytetu i manifestu ma 1–128 znaków ASCII z alfabetu `[A-Za-z0-9._:-]`, zaczynając od litery lub cyfry. Liczniki są nieujemnymi bezpiecznymi liczbami całkowitymi; `floorSeq <= headSeq`.

Manifest jest pusty albo opisuje niezmienny szyfrogram: `id`, `sequence`, `format`, `ciphertextDigest` i `bytes`. Jego sekwencja odpowiada głowie stanu; format jest dokładnie V2, a liczba bajtów dodatnia. Limit 64 KiB dotyczy wyłącznie metadanych odpowiedzi. Nie określa limitu klinicznego szyfrogramu ani pojemności konta. Limitów biblioteki szablonów nie przenosimy na dane pacjentów.

| Stan strukturalny | Znaczenie |
| --- | --- |
| `absent` | `initialized=false`, brak autorytetu i manifestu, wszystkie liczniki oraz minimalna wersja równe zero. Dopiero uwierzytelniony transport może potwierdzić brak domeny. |
| `initialized-empty` | Istnieje autorytet i epoka, minimalny format wynosi 2, dziennik jest pusty i nie ma manifestu. Domena pozostaje chroniona; to nie jest potwierdzenie pustej bazy pacjentów. |
| `initialized` | Istnieje autorytet, epoka i manifest V2 odpowiadający głowie dziennika. |

Walidator struktury zwraca odłączoną, zamrożoną obserwację. Nie uwierzytelnia odpowiedzi i nie wydaje uprawnienia do odczytu lub zapisu. Błędna domena lub wersja oznacza brak obsługi; uszkodzona struktura oznacza błąd danych; niezgodne powiązanie konta oznacza błąd uwierzytelnienia; zmiana epoki lub cofnięcie liczników wymaga ponownego uzgodnienia. HTTP 404, HTML i błąd sieci nigdy nie stają się automatycznie stanem `absent`.

## Wyłączony zapis i zakres sesji

Oba dotychczasowe wyłączniki zapisu planów V2 pozostają stałe. Flaga klienta, argument funkcji, poprawny JSON, podgląd i odpowiedź biblioteki nie mogą ich włączyć.

Bez jawnej obserwacji bieżącego konta wybór kanału jest synchronicznym wyborem V1. Nie wywołuje adaptera, kryptografii, sieci ani inicjalizacji kluczy. Jawne sprawdzenie korzysta z istniejącego prywatnego tokenu sesji i sprawdza go ponownie po granicy asynchronicznej. Obserwacje pozostają w RAM osobno dla lokalnych kont. Zmiana sesji, klucza, adaptera lub trybu tego samego konta unieważnia obserwację i utrzymuje blokadę powrotu do V1.

Obecny kod odzyskiwania może wytworzyć materiał SIS z DEK. Samo istnienie SIS w RAM lub w starym profilu nie dowodzi odtworzenia pełnej pierwotnej tożsamości. Dlatego sprawdzenie w tej wersji jawnie zgłasza `IDENTITY_BOOTSTRAP_UNVERIFIED`, zachowuje dane i nie wykonuje próby sieciowej, wyprowadzania kluczy ani migracji. Ten etap nie potwierdza pełnego bootstrapu nowego urządzenia.

Wybrany stan chroniony, nieznany lub nieaktualny nie uprawnia do wysłania danych dawnym kanałem. Zwracane opisy tras nie są poświadczeniami. Przyznanie przez przeglądarkę miejsca dla `sendBeacon` nie jest trwałym potwierdzeniem serwera. Biblioteka szablonów zachowuje swój dotychczasowy niezależny kanał.

Granica w tej części zatrzymuje nowe operacje przed wysłaniem lub mutacją i ponownie sprawdza stan po istniejących granicach asynchronicznych. Nie cofa wcześniej zatwierdzonych zapisów ani pracy już przekazanej do IndexedDB, niestandardowego adaptera lub sieci. Dotychczasowy V1 może potwierdzać sukces żądania IndexedDB przed końcem całej transakcji. Bez zmiany tych zasad nie można obiecać odwołania każdej rozpoczętej transakcji. Dlatego jawne sprawdzenie nie jest aktywacją V2: przed aktywacją konieczne są dodatkowe bariery opróżnienia kolejek i dowody atomowości lokalnej oraz serwerowej.

## Import, kopie i lokalne dane

Rezerwujemy rodzinę formatów `vilda-clinical-vault/`. Rozpoznany chroniony albo przyszły format zatrzymuje stary import przed pierwszą mutacją; materiał wejściowy zostaje zachowany. Zwykłe `schemaVersion: 2` dawnej kopii konta nie oznacza klinicznego V2. Dotychczasowe walidatory i bajty eksportu V1 nadal obowiązują.

Nie ma automatycznej zmiany wersji bazy, promocji danych ani inicjalizacji autorytetu podczas startu lub odczytu. Stary klient wywołuje `deleteDatabase` bez numeru wersji. Sama zmiana prywatnej bazy z 5 na 6 nie chroni przed takim usunięciem. Przed aktywacją potrzebny jest sprawdzony osobny lokalny obszar oraz próby starych operacji usuwania, czyszczenia, otwartych kart, trybu bez cache i trybu tymczasowego.

## Warunki przed zastosowaniem szablonu

Kolejne części etapu 6 muszą dostarczyć zgodne zaplecze, pełny bootstrap tożsamości i powiązane kryptograficznie koperty, ochronę lokalnego usuwania, kompletne operacje importu/kopii/usuwania, weryfikację pochodzenia V2 oraz atomowe transakcje planu i jego dokumentów. Stare zmiany offline wymagają odrębnego zachowania do przeglądu; pojedyncza kopia `.prev` nie dowodzi zachowania całej historii.

Backendowy PR #29 dotyczy biblioteki szablonów. Jego scalenie lub wdrożenie nie uruchamia klinicznego V2. Kod, scalenie, wdrożenie i uwierzytelnione potwierdzenie zgodności są oddzielnymi faktami. Ten etap nie wykonuje wdrożenia ani operacji na rzeczywistym koncie.

Etap 6b, scalony w backendowym PR #30, dodaje osobny odczyt stanu chronionej domeny.
Etap 6c przygotowuje [samodzielnie odszyfrowywalny lokalny punkt przywracania](PATIENT_CHECKPOINTS.md)
przed przyszłą migracją. Nie zamienia kandydata SIS w potwierdzoną tożsamość i nadal
nie włącza żadnego wyłącznika zapisu planów V2.

Dopiero po tych warunkach zastosowanie szablonu utworzy własne identyfikatory pacjenta i niezmienny zapis wybranej wersji. Wymagane będą wybrane kroki, brak pustych etapów, jawne uruchomienie i ręczny przegląd. Dopisane etapy pozostaną zaplanowane; wynik nie uruchomi automatycznie kolejnego etapu ani nie zamknie planu.

## Odtwarzalna kontrola zmian artefaktów

`node tools/check_patient_authority_boundary.mjs` porównuje pełne drzewo składni sejfu i importera z bazą `28e7ddb87ee3088fa869c47a6c61fb7a97c32be6`. Usuwa wyłącznie opisane dodatki blokad, sprawdza skróty nowych funkcji oraz dwóch zmian parsera i wymaga zgodności pozostałej logiki V1. Kontrola nie wykonuje kodu aplikacji ani zapisów. W płytkim checkoutcie można wskazać katalog z plikami tej bazy przez `--base-dir=/ścieżka/do/bazy`.

Ten dowód uzupełnia testy rzeczywistych modułów. Nie dowodzi wycofywania już wysłanych operacji, atomowości serwera ani poprawności medycznej.

`node tools/check_patient_clinical_transport_delta.mjs` odtwarza trzy artefakty synchronizacji z tej samej przypiętej bazy według dosłownych zmian w `tools/clinical-transport-source-delta.json`. Sprawdza skróty plików, kolejność funkcji oraz zgodność pozostałego drzewa składni po usunięciu dodatków blokad. Także ten skrypt obsługuje `--base-dir` i nie wykonuje aplikacji ani zapisów. Zgodność projekcji składni jest dowodem ograniczenia zmian, a zachowanie zwykłej ścieżki V1 sprawdzają osobno testy rzeczywistych modułów.
