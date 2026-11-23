# Niezależna kartoteka pacjenta

Edycja kartoteki w podglądzie nowego Gabinetu zapisuje niezmienną rewizję
`prf-<UUID>` w magazynie `patientNotes`. Dane `profileContext` są częścią
zaszyfrowanego `bodyCipher`. Zapisane wizyty zachowują bajty swoich danych,
daty pomiarów, wyniki i identyfikatory.

Obiekt `profileContext` wersji 1 zawiera `kind` równe `patient-profile`, dane
`data` i listę identyfikatorów poprzednich rewizji `parents`. Pierwsza rewizja
zawiera `legacyRevisionId` powiązany z danymi źródłowymi. Aktualna wersja wynika
z relacji między rewizjami.

Kartoteka obejmuje dane identyfikacyjne, opiekuna, wzrost rodziców, dane
okołoporodowe, wywiad o początku dojrzewania, menarche i leczeniu GnRHa oraz
rozpoznanie zespołu Downa. Bieżące pomiary, wyniki SGA, Tanner, objętość jąder
i historia wzrastania należą do zapisanej wizyty.

## Odczyt i edycja

W podglądzie `getPatient(id).profile` udostępnia stan `legacy`, `ready`,
`conflict`, `unsupported` albo `incomplete`. Wynik obejmuje dane, identyfikator
bieżącej rewizji, historię z datami utworzenia oraz informację o dostępności
edycji. Pierwszy odczyt starszej kartoteki korzysta z najnowszej klinicznie
wizyty. Dla dawnych danych bez daty źródłem jest pierwszy dostępny zapis.
Brak spójnej wersji wstrzymuje użycie danych do rozpoczęcia wizyty.

Przeniesienie do kosza wizyty, która jest źródłem starszej kartoteki,
utrwala jej dane stałe razem z operacją przeniesienia. Pierwsza niezależna
rewizja zachowuje dotychczas odczytywane dane, także gdy kosz pozostawia
pacjenta bez aktywnych wizyt. Sam odczyt kartoteki nie tworzy rewizji.

Jeżeli standardowy format zmieniłby treść starszych danych, rewizja
`patient-profile-legacy-baseline` zachowuje ich dotychczasowy odczyt.
Kolejna edycja sprawdza pola według bieżących reguł kartoteki. Klient,
który nie obsługuje takiej rewizji, wstrzymuje użycie profilu.


`savePatientProfile({patientId, expectedRevisionId, data}, options)` zapisuje
nową rewizję przez `savePatientNoteOnce`. Identyczne dane zwracają potwierdzenie
`unchanged: true`. Operacja kopiuje intencję przed oczekiwaniem, sprawdza bazową
rewizję pod blokadą i potwierdza bieżącą sesję po szyfrowaniu. Zmiana właściciela
lub rewizji przerywa zapis.

Równoległe zmiany zachowują obie wersje. `resolvePatientProfile` przyjmuje
zestaw `expectedHeadIds` widoczny przy wyborze i tworzy jedną nową rewizję
powiązaną z każdą wybraną wersją. Zmiana tego zestawu unieważnia otwarte
rozstrzygnięcie.

## Prezentacja i transport

W podglądzie kartoteka, katalog, wyszukiwanie i dopasowanie pacjenta używają
aktualnej tożsamości. Otwarta historyczna wizyta utrzymuje własne dane.
Rewizje kartoteki mają własną historię w edytorze pacjenta.

Kopie zapasowe, eksport, synchronizacja i odtwarzanie korzystają z pełnych
zaszyfrowanych wpisów. Gdy starszy klient prześle rewizję bez `profileContext`,
klient obsługujący kartotekę zachowa posiadany już kontekst. Dwie różne treści
z tym samym identyfikatorem powodują konflikt. Przyszły format pozostaje
zapisany. Jego edycja wymaga wersji aplikacji obsługującej ten format.

Scalenie pacjentów przenosi rewizje z ich identyfikatorami i relacjami.
Pojedyncze zdarzenia usunięcia rewizji są pomijane. Usunięcie całego pacjenta
obejmuje jego rewizje i korzysta z dotychczasowego mechanizmu usuwania
dokumentów. Pozostałe dane z tej samej partii synchronizują się normalnie.

## Odtwarzanie artefaktu

Źródła są w `runtime/patient-profile-v1/`. Polecenie
`node tools/patient-profile-vault-delta.mjs` weryfikuje odwracalność warstwy
na obrazie sejfu o skrócie podanym w manifeście. Manifest wiąże źródła,
przekształcenia i cały artefakt. Kontrola bieżącej bazy usuwa najpierw warstwę
kartoteki i następnie odtwarza dowody wcześniejszych zmian sejfu.
