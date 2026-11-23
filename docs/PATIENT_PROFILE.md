# Niezależna kartoteka pacjenta

Kartoteka jest rejestrem zapisanych danych pacjenta, niezależnym od wizyt.
Jawna edycja tworzy niezmienny dokument `prf-<UUID>` w istniejącym magazynie
`patientNotes`. Obiekt `profileContext` znajduje się wyłącznie wewnątrz
`bodyCipher`. Nie powstaje snapshot ani nowa wizyta; dotychczasowe payloady,
daty pomiarów, wyniki i identyfikatory wizyt pozostają bez zmian.

`profileContext` wersji 1 zawiera `kind: "patient-profile"`, pełne `data`
oraz `parents` wskazujące identyfikatory poprzednich rewizji. Pierwsza rewizja
ma pustych rodziców i token `legacyRevisionId` identyfikujący odczytaną
projekcję starszych danych. Nie korzystamy z czasu ani technicznego numeru
notatki do wybierania obowiązującej kartoteki.

Zakres danych obejmuje imię, nazwisko, datę urodzenia i płeć, opiekuna,
wzrost rodziców, komplet zapisanych `perinatal`, trwały wywiad dotyczący
początku dojrzewania/menarche/GnRHa oraz `clinical.downSyndrome`.
Nie obejmuje pomiaru bieżącego, historii wzrostu, Tannera, objętości jąder,
wyniku oceny dojrzewania ani zapisanego obiektu SGA `birth`.
Wartości pochodne SGA i normy nie są tutaj obliczane ani zmieniane.

## Odczyt i zapis

`getPatient(id).profile` zwraca:

- `status`: `legacy`, `ready`, `conflict`, `unsupported` albo `incomplete`;
- `data`, `revisionId`, `history`, `heads` oraz `editable`;
- historię z `revisionId`, `parents`, `createdAtISO` i pełnym `data`.

Przy braku rewizji odczytujemy tylko projekcję zgodności ze starszych danych.
Podstawą jest najnowsza klinicznie wizyta; dopiero przy braku jej daty używany
jest pierwszy dostępny payload. Sam odczyt niczego nie migruje i nie zapisuje.
Stan sprzeczny, przyszły lub niekompletny ma `data: null` i nie wraca po cichu
do starszego snapshotu.

`savePatientProfile({patientId, expectedRevisionId, data}, options)` waliduje
nowe dane i tworzy nową rewizję przez istniejący `savePatientNoteOnce`.
Brak zmiany zwraca `unchanged: true` bez zapisu. Nowa intencja jest kopiowana
przed oczekiwaniem. W istniejącym aktorze kolejność blokad to workspace,
pacjent, notatka; sprawdzenie bazowej rewizji następuje ponownie przed zapisem.
Opcja `isCurrent` działa także na rzeczywistej granicy zatwierdzenia po
szyfrowaniu. Błąd bieżącego właściciela/sesji nie jest komunikatem sukcesu.

Dwie równoległe edycje zachowują osobne głowy grafu. Nie nadpisują się po
zegarze i nie łączymy automatycznie ich pól. Jawne
`resolvePatientProfile({patientId, expectedHeadIds, data}, options)` dodaje
kolejną rewizję z wszystkimi wskazanymi rodzicami. Historia nie jest usuwana.
Zmiana zestawu głów unieważnia otwarte rozstrzygnięcie.

## Transport i prezentacja

Wizyty pozostają historycznymi faktami. Aktualna tożsamość profilu jest
projekcją nagłówka w kartotece, katalogu, wyszukiwaniu i rozpoznawaniu pacjenta.
Nie wstrzykujemy jej do historycznych payloadów ani zapisanych obliczeń.
Rewizje są wyłączone ze zwykłych Notatek, Historii pacjenta, terminarza,
wyszukiwania notatek, reguł list i serii wyników/leczenia.

Backup, eksport pacjenta, synchronizacja i recovery przenoszą surowe
zaszyfrowane rekordy. Nie korzystają z przefiltrowanej prezentacji notatek.
Pomijany przez starszego klienta `profileContext` nie kasuje znanego
odbiorcy kontekstu. Różne treści pod tym samym identyfikatorem rewizji są
odrzucane jako konflikt, a nie rozstrzygane po czasie.
Nie gwarantujemy, że nieznający tego pola starszy program zachowa je we
własnej bazie. Przyszłe wersje otrzymane przez nowy program pozostają opaque
i tylko do odczytu.

Scalenie pacjentów przenosi wszystkie rewizje wraz z niezmiennymi ID i
rodzicami. Rozbieżne historie dają jawny konflikt w karcie docelowej.
Kosz wizyt nie usuwa kartoteki. Usunięcie całego pacjenta usuwa także jego
rewizje zgodnie z dotychczasowymi nagrobkami dokumentów. Zwykły edytor
notatki ani ręczne usunięcie notatki nie modyfikują historii kartoteki.
Synchronizacja pomija pojedynczy nagrobek `prf-` bez poprawnego
`deletedWithPatient` (lub z innym właścicielem), zachowując pozostałe dane
z tej samej partii. Prawidłowe usunięcie całego pacjenta nadal podlega
dotychczasowym regułom nagrobków dokumentów.

## Odtwarzalny artefakt

Czytelne źródła są w `runtime/patient-profile-v1/`. Budowniczy
`tools/patient-profile-vault-delta.mjs` nakłada dokładną zewnętrzną deltę
na przypięty obraz szybkiej wizyty `981b7dd7…`; nie zmienia chronionego
bloku natywnego. Manifest wiąże źródła, deklarowane haki i pełny wynik.
Redukcja następnych kontroli usuwa tę warstwę przed dotychczasową deltą
szybkiej wizyty. Historyczne dowody wcześniejszych warstw pozostają odrębne.
