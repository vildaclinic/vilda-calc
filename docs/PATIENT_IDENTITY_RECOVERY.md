# Odczyt zachowanego powiązania tożsamości — etap 6d

Etap 6d udostępnia jawną weryfikację tożsamości odzyskanej z wcześniej zachowanego
powiązania. Nie zapisuje powiązań, nie inicjuje domeny danych pacjentów i nie
przeprowadza migracji. **Bieżące konta nie otrzymują statusu kont zakotwiczonych**.
Wczytanie modułów i odczyt ich kontraktów nie uruchamiają sieci, kryptografii,
magazynów ani zegarów.

Operacja `VildaVault.inspectPatientAuthorityRecovery({ expected })` korzysta
wyłącznie z DEK bieżącego odblokowanego konta i jawnego, niezależnie zachowanego
oczekiwania `expected`. Aktywny kandydat SIS oraz `getSyncMaterial()` nie są
źródłem tożsamości tej operacji. Dotychczasowe wywołanie
`inspectPatientAuthority()` zachowuje swój wynik blokujący.

## Niezależne oczekiwanie

`expected` ma dokładnie pola `namespace`, `protocol`, `locatorId`, `revision`,
`generation`, `slotId`, `authorityId`, `keyBinding`, `epoch`, `capsuleDigest`,
`formatFloor`, `headSeq` i `floorSeq`. Domena to
`patient-clinical-identity-locator`, protokół ma wartość `1`, a `formatFloor`
wartość `2`. `locatorId`, `slotId`, `keyBinding` i `capsuleDigest` mają po 64 małe
cyfry szesnastkowe; `authorityId` spełnia dotychczasową regułę identyfikatora ASCII
o długości 1–128 znaków. Liczniki są bezpiecznymi liczbami całkowitymi JavaScript.
Epoka, rewizja i generacja są
dodatnie. `floorSeq` nie przekracza `headSeq`.

Oczekiwanie musi pochodzić z niezależnie zachowanego, zaufanego zapisu utworzenia
powiązania. Nie wolno tworzyć go z właśnie pobranej odpowiedzi, uwierzytelnienia
V1 ani lokalnego checkpointu. Prefiks `local-checkpoint:` nie jest dopuszczalnym
autorytetem serwerowym. Wyższa epoka, rewizja lub generacja wymagają uzgodnienia;
same w sobie nie upoważniają do zaakceptowania rotacji.

## Ograniczony przebieg odczytu

1. Trzy odrębne etykiety HKDF-SHA-256 z DEK wyprowadzają identyfikator lokalizatora,
   poświadczenie wyłącznie do odczytu oraz klucz szyfrowania kapsuły tożsamości.
   Identyfikator nie jest poświadczeniem. Surowy DEK nie jest wysyłany.
2. Klient wykonuje wyłącznie `GET` pod stałym adresem
   `https://vilda-sync.maciej-4b9.workers.dev/v1/patient-clinical-vault/recovery-locators/:locatorId/state`,
   używając osobnego Bearer o długości 64 małych cyfr szesnastkowych.
3. Aktywny deskryptor musi dokładnie odpowiadać zachowanemu oczekiwaniu. Klient
   sprawdza SHA-256 i długość kanonicznych bajtów kapsuły, jej kontekst AES-GCM
   oraz odzyskany 64-bajtowy pakiet DEK i pierwotnego SIS. Odzyskany DEK musi
   bajtowo odpowiadać kluczowi użytemu do odnalezienia lokalizatora.
4. Z odzyskanego SIS klient ponownie wyprowadza kanoniczny slot i tymczasowy token
   synchronizacji; z pełnego pakietu wyprowadza `keyBinding`. Odczytuje istniejącą
   trasę `GET /v1/slots/:slotId/patient-clinical-vault/state` z nagłówkiem
   `X-Vilda-Clinical-Key-Binding`.
5. Wymagane są ten sam autorytet, powiązanie kluczy i epoka, brak cofnięcia
   liczników oraz zainicjowany stan z manifestem. Stan pustej inicjalizacji,
   brak autorytetu albo niezgodność pozostawiają blokadę.

Oba żądania pomijają ciasteczka i cache, odrzucają przekierowania oraz nie wysyłają
Referer. Adres z konfiguracji V1 ani adres dostarczony w deskryptorze nie może
zmienić miejsca wysłania poświadczeń. Limit 65 536 bajtów jest sprawdzany podczas
odczytu strumienia; dekoder odrzuca nieprawidłowy UTF-8. Jeden limit 30 sekund
obejmuje nagłówki i ciało odpowiedzi. Po każdej operacji klient przerywa żądanie
i anuluje czytnik. Nie wykonuje ponowienia przez rejestrację, magazyn V1,
bibliotekę szablonów ani inny slot.

Kapsuła ma osobny format `vilda-clinical-vault/identity-capsule/v1`. Jej AES-GCM
wiąże domenę, protokół, lokalizator, slot, autorytet, `keyBinding`, epokę i generację.
Skrót dotyczy odtworzonego JSON o stałej kolejności pól, a nie formatowania
otrzymanego tekstu. Nie jest to przemianowana kapsuła hasłowa z etapu 6c.

## Błędy pozostają stanem chronionym

Odpowiedzi mają zamknięte listy pól i typów. Klient odrzuca dodatkowe pola,
akcesory, własne prototypy, symbole oraz ukryte właściwości; zwraca odłączone,
zamrożone metadane. Raport publiczny nie zawiera pakietu kluczy, tokenu, kapsuły
w postaci jawnej, surowej odpowiedzi, komunikatu serwera ani dowolnego `cause`.

| Wynik lokalizatora | Znaczenie dla klienta |
| --- | --- |
| `locator_missing` | brak zachowanego powiązania; tożsamość niepotwierdzona |
| `invalid_credentials`, `identity_mismatch` | niepotwierdzone poświadczenie lub powiązanie |
| `locator_pending` | nieukończony protokół powiązania |
| `locator_revoked` | zachowany znacznik unieważnionej linii klucza |
| `locator_unsupported` | nierozpoznana wersja lub stan |
| `locator_corrupt`, `locator_unavailable` | uszkodzony lub niedostępny zachowany stan |

Bez zachowanego wiersza nie istnieje weryfikator poświadczenia. Dlatego nawet
typowane `locator_missing` nie poświadcza nieobecności autorytetu pacjenta.
Brak wcześniej oczekiwanego powiązania wymaga uzgodnienia. Ogólne `404`, HTML,
nieznana trasa, błąd sieci i timeout także nie zwalniają blokady V1 ani nie
pozwalają utworzyć autorytetu.

## Sesja, nakładanie operacji i granica ochrony przed cofaniem

Każda nowa lub dotychczasowa jawna inspekcja zastępuje poprzednią operację tego
konta, zanim odda sterowanie. Sprawdzenie sesji obejmuje konto, klucze DEK i SIS,
adapter, tryb, stan tymczasowy i hybrydowy oraz generację sesji. Zarówno udane,
jak i odrzucone kroki asynchroniczne sprawdzają aktualność operacji. Spóźniony
wynik nie może zastąpić nowszego raportu. Własne robocze bufory bajtów są zerowane;
JavaScript nie zapewnia deterministycznego usunięcia wszystkich kopii sekretu.

Po poprawnej weryfikacji klient zapamiętuje w RAM tego konta i sesji najwyższe
zaobserwowane `headSeq` i `floorSeq`. Kolejna próba musi spełnić co najmniej te
wartości, również gdy przekazane oczekiwanie zawiera starsze liczniki. Zmiana
identyfikatora powiązania, kapsuły, epoki, rewizji lub generacji wymaga uzgodnienia.

Ten próg w pamięci nie jest trwałym zabezpieczeniem całego konta. Zmiana sesji
unieważnia jego zakres, a przeładowanie strony usuwa pamięć procesu. Po ponownym
wczytaniu niezależne oczekiwanie trzeba dostarczyć ponownie. Brak lokalnego
zapamiętania nigdy nie jest dowodem braku domeny na serwerze.

## Znaczenie wyniku dodatniego i następna bramka

Wynik `recovery-verified` z kodem `IDENTITY_RECOVERY_VERIFIED_WRITER_OFF` oznacza
zgodność kryptograficzną z dostarczonym niezależnym oczekiwaniem. Raport nadal
ma `authorityVerified: false`, `readAvailable: false`, `writeAvailable: false`,
`receipt: null` i `preserveLocal: true`. Odzyskany SIS nie jest instalowany
w aktywnym sejfie, rejestrze, cache synchronizacji ani magazynach sesji.

Udostępnienie kapsuły pełnego pakietu szyfrowanej kluczem wyprowadzonym z DEK
pozwala posiadaczowi tego DEK odzyskać także SIS. Przyszły protokół zaufanego
utworzenia powiązania musi jawnie autoryzować takie przekazanie możliwości
odzyskiwania; samo posiadanie starego poświadczenia V1 tego nie zatwierdza.

Przed aktywacją potrzebne są osobno: jawne zaufane utworzenie powiązania,
atomowość z inicjalizacją autorytetu, reguły istniejących kont bez powiązania,
rotacja i usuwanie między domenami, import, zachowanie zmian offline oraz
atomowa publikacja manifestu i dokumentów. Kod odczytu i testowe zachowane
powiązania nie zamykają tych bramek. Ta część nie wdraża Workera i nie wykonuje
operacji na rzeczywistych kontach.
