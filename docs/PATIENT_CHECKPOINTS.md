# Szyfrowany punkt przywracania pacjentów — etap 6c

Ta część przygotowuje lokalny punkt przywracania potrzebny przed przyszłym
przejściem na nowy format danych pacjentów. Nie inicjuje domeny na serwerze,
nie włącza zapisu planów V2 i nie dodaje przycisku zastosowania szablonu.
Wywołanie jest jawne; uruchomienie strony i zwykły odczyt pacjenta nie tworzą kopii.

## Co musi przetrwać

Stary klient może usunąć `vilda_user_<id>` oraz wpis w rejestrze użytkowników.
Usuwa wtedy również dotychczasowe opakowania klucza. Sama kopia szyfrogramu
w osobnej bazie nie wystarczyłaby do późniejszego odczytu.

Dlatego jeden niezmienny rekord punktu przywracania zawiera łącznie:

- szyfrowany obraz wszystkich magazynów istniejącej prywatnej bazy użytkownika;
- niezależne opakowanie 64-bajtowego pakietu DEK i kandydata SIS, chronione hasłem
  odzyskiwania przekazanym przy tworzeniu kopii;
- powiązanie lokalnego konta i identyfikator kopii, potrzebne do jej odnalezienia
  bez starego rejestru.

Pakiet jest **kandydatem o niepotwierdzonym pochodzeniu tożsamości**. Istniejące
profile, sesje i kody synchronizacji mogły wcześniej odtworzyć SIS z samego DEK.
Poprawne odszyfrowanie i zgodność wyprowadzonych identyfikatorów nie dowodzą
posiadania pierwotnego SIS. Zapis kopii nie nadaje uprawnienia do zapisu danych
pacjenta ani nie potwierdza, że serwer nie ma chronionej domeny pod innym slotem.

## Jawna operacja i spójny odczyt

`VildaVault.createPatientClinicalCheckpoint(recoveryPassword, { id })` obsługuje
wyłącznie bieżące odblokowane konto z natywną prywatną bazą IndexedDB. Tryby
chmurowy, tymczasowy, adapter niestandardowy i brak wymaganych możliwości
przeglądarki nie uzyskują zastępczego zapisu w innym miejscu.

Źródło jest odczytywane w jednej transakcji `readonly`, ze wszystkich magazynów
istniejącej bazy. Operacja nie korzysta z eksportu synchronizacji, który może
przycinać znaczniki usunięcia. Zachowuje klucze i wartości, w tym wartości binarne.
Kodek zachowuje obsługiwane typy zamiast zamieniać je na zwykły JSON. Nieobsługiwany
typ lub uszkodzone dane zatrzymują operację przed zapisem kopii.
Dotyczy to także magazynu z automatycznym generatorem kluczy: API odczytu IndexedDB
nie ujawnia całego stanu tego generatora. Takiego magazynu nie wolno opisać jako
w pełni odtworzonego. Obecne magazyny prywatnego sejfu nie używają `autoIncrement`.

Utworzenie kopii i aktualna operacja usuwania tego samego konta korzystają
ze wspólnej blokady Web Locks. Zmiana sesji, konta, adaptera lub trybu unieważnia
operację. Zamknięcie uchwytu przerywa aktywne transakcje; wynik zapisu jest
potwierdzany dopiero po `transaction.oncomplete`. Nie można cofnąć transakcji,
która już się zakończyła — zapisanej kopii nie przypisuje się wtedy nowemu kontu.

Punkt przywracania pozostaje niezmienny. Ponowienie identycznego rekordu pod tym
samym identyfikatorem nie tworzy drugiej kopii. Zmieniona treść pod istniejącym
identyfikatorem jest konfliktem. Ponowne szyfrowanie z nowym IV nie jest dokładnym
ponowieniem poprzedniego rekordu.

## Lokalny magazyn i odzyskiwanie

Baza `clinical-authority-checkpoints-v1` ma wersję 1 i magazyn `checkpoints`
z kluczem `[binding, id]` oraz indeksem `byBinding`. `binding` jest skrótem SHA-256
dokładnego lokalnego identyfikatora konta. Nie jest hashem hasła ani potwierdzeniem
tożsamości serwerowej.

`VildaPatientCheckpointStore.createIndexedDBStore(...)` nie wykonuje I/O podczas
tworzenia uchwytu. Odczyt nie tworzy brakującej bazy. Nowsza wersja lub nieznany
schemat oznaczają brak obsługi; nie są naprawiane przez usunięcie magazynu.
Wyliczenie zapisanych powiązań kont nie wymaga starego rejestru użytkowników.

Hasło odzyskiwania oraz zachowany rekord wystarczają do odszyfrowania pakietu
kluczy i obrazu bazy. Odczyt tego obrazu jest czym innym niż przywrócenie go do
aktywnego sejfu: ta część nie implementuje importu, zastępowania bieżących danych
ani promocji kopii do serwerowego źródła danych.

Aktualny klient zatrzymuje usuwanie konta, gdy wykryje zachowane kopie, zanim
zmieni dane V1. Starszy klient nie zna tej blokady; sprawdzany zakres ochrony
polega na zachowaniu i samodzielnej czytelności kopii po jego operacji usuwania.
Nie obejmuje usunięcia danych witryny przez użytkownika przeglądarki,
administracyjnego skasowania nowej bazy, utraty profilu przeglądarki ani awarii
nośnika. Nie jest to zewnętrzna kopia zapasowa.

## Szyfrowanie i ścisły format

`VildaClinicalCrypto` jest osobnym modułem. Dotychczasowy `VildaCrypto`, jego
koperty V1, wyprowadzanie kluczy i odczyt starych danych pozostają bez zmian.

Klucz szyfrowania obrazu oraz `keyBinding` są wyprowadzane HKDF-SHA-256 z pełnego
64-bajtowego pakietu, z różnymi etykietami. Materiał szyfrujący jest nieeksportowalny
i przechowywany za prywatnym uchwytem. Kopie robocze bajtów są zerowane;
moduł nie zeruje buforów będących własnością wywołującego.

| Koperta | Format | Powiązanie AES-GCM przez AAD |
| --- | --- | --- |
| Obraz danych | `vilda-clinical-vault/v2` | format, algorytm, domena, protokół, slot, autorytet, `keyBinding`, epoka, ID, sekwencja, rodzaj |
| Pakiet kluczy | `vilda-clinical-vault/credential/v1` | format, algorytm, komplet parametrów KDF, lokalne powiązanie, slot, `keyBinding` |

IV AES-GCM ma 12 losowych bajtów. Sól opakowania kluczy ma 16 losowych bajtów.
PBKDF2-SHA-256 używa domyślnie 600 000 iteracji, przy ścisłym zakresie
100 000–4 000 000. Sól efektywna ma dodatkowy stały prefiks domeny; zapisane
16 bajtów nie są solą starej koperty V1. Parametry są sprawdzane przed kosztowną
operacją kryptograficzną.

Konteksty i koperty mają zamknięte listy pól oraz kanoniczny Base64. Zamiana slotu,
epoki, identyfikatora, rodzaju albo parametrów KDF nie może zostać przyjęta
przez ponowne oznaczenie starych bajtów. Odszyfrowanie wymaga dokładnie oczekiwanego
kontekstu. Nie ma zastępczej próby odszyfrowania algorytmem V1.

Limit metadanych nie jest limitem danych klinicznych. Nie przenosi się tu limitów
biblioteki szablonów. Faktyczna dostępna przestrzeń zależy od przeglądarki;
odmowa zapisu pozostawia dane źródłowe V1 nienaruszone.

Hasło tej kopii jest niezależnym hasłem odzyskiwania. Zmiana hasła aktywnego konta
nie unieważnia historycznej kopii ani jej poprzedniego hasła. Rotacja i pełne
usuwanie wszystkich domen wymagają osobnego protokołu.

## Co pozostaje przed zapisem planów V2

Nadal potrzebne są potwierdzenie pełnej tożsamości, zweryfikowany stan usługi,
kontrolowane uruchomienie domeny, atomowy zapis manifestu i dokumentów oraz
obsługa importu, rotacji, usuwania i starszych zmian offline. Lokalne powodzenie
tej operacji nie zamyka żadnej z tych bramek.

Backend scalony w `vilda-source` jako PR #30 udostępnia wyłącznie odczyt stanu.
Samo scalenie kodu nie oznacza jego wdrożenia. Ta część nie wykonuje wdrożenia
Workera ani operacji na rzeczywistych kontach.

Nowe moduły są dostępne z produkcyjnego cache offline. Instalacja pozostaje
w dotychczasowym limicie 600 żądań: bieżące adresy trzech niezmienionych plików
statycznych współdzielą odpowiedź pobraną w tej samej instalacji. Historyczny
wpis z poprzedniego cache nie jest źródłem innej wersji ani innego adresu.

Wycofanie wersji aplikacji nie powinno usuwać bazy checkpointów ani przerabiać
ich na kopie V1. Starsza aplikacja nie potrafi ich odczytać; do odzyskania potrzebne
są zgodny moduł i hasło odzyskiwania. Nie należy traktować starego importera jako
narzędzia odtworzenia tego formatu.
