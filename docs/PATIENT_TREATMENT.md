# Rozpoznania i przebieg leczenia w Karcie pacjenta

Zaakceptowany wariant B1 rozdziela zapisane rozpoznanie od epizodu leczenia.
Jeden pacjent może mieć kilka rozpoznań i kilka metod leczenia jednego problemu.
Kod ICD-10 jest opcjonalnym tekstem wpisanym przez lekarza. Aplikacja nie nadaje
go z BMI, nazwy leku, programu GH ani wcześniejszych notatek.

## Dane i własność

Każde rozpoznanie i każdy epizod jest niezależną zwykłą notatką pacjenta.
`note.id` jest identyfikatorem rekordu, a `note.patientId` określa właściciela.
Nowy opcjonalny `treatmentContext` znajduje się wyłącznie w zaszyfrowanym
`bodyCipher`; nie jest jawną kolumną, preferencją, danymi formularza pomiaru ani
nowym magazynem. Kategoria `treatment` pozwala odnaleźć wpis w istniejącej
historii. Pole `medication` **poza** kontekstem pozostaje puste: nowy zapis nie
tworzy zdarzenia start/change/stop dla dawnego monitora leków.

Kontekst rozpoznania, wersja 1:

```js
{
  schemaVersion: 1, kind: 'diagnosis',
  name: 'Fikcyjne rozpoznanie', code: '', codingSystem: 'ICD-10',
  status: 'active', // active | closed
  dateISO: '2026-11-03'
}
```

Kontekst epizodu, wersja 1:

```js
{
  schemaVersion: 1, kind: 'therapy', title: 'Fikcyjne postępowanie',
  method: 'other', // pharmacological | nonpharmacological | other
  status: 'active', // active | closed
  startDateISO: '', endDateISO: '', diagnosisIds: [],
  medication: '', dose: '', notes: '', nextDateISO: '',
  followups: [{ id: 'fikcyjna-kontrola', dateISO: '2026-11-03',
    kind: 'Kontrola', body: 'Fikcyjna dokumentacja kontroli.' }]
}
```

`diagnosisIds` zawiera identyfikatory notatek rozpoznań. Nie zawiera kopii nazwy,
kodu ani danych innego pacjenta. Nowe powiązanie musi wskazywać rozpoznanie
odczytane w tej karcie. Nieczytelne lub nieobecne dawne powiązanie pozostaje
zachowane; edycja nie usuwa go po cichu. Zakończenie epizodu zmienia tylko jego
notatkę, bez zmiany stanu rozpoznania.

`medication` i `dose` są zapisem lekarza, bez analizy dawki. Przy zmianie metody
nie kasujemy wcześniej zapisanych wartości. Ludzki opis pokazuje je dla
farmakoterapii. Data następnej kontroli jest dokumentacją epizodu; sam jej zapis
nie tworzy automatycznie przypomnienia ani planu opieki.

## API i zabezpieczenia zapisu

`VildaPatientTreatmentModel` udostępnia czyste `normalize`, `decode`, `project`
i `describe`. Wersja nieobsługiwana lub błędny kontekst daje `unsupported`,
a brak pola — `none`. Brak rozpoznania lub leczenia nie jest oceną kliniczną.

`VildaPatientTreatmentStore.createScope({ vault, patientId, isCurrent })`
przechwytuje bieżącą sesję sejfu i zwraca:

- `read()` → `{ patientId, diagnoses, episodes, unsupported }`;
- `createDiagnosis(values)` / `updateDiagnosis(dto, values)`;
- `removeDiagnosis(dto, binding)` → `{ id, removed: true }`;
- `createEpisode(values)` / `updateEpisode(dto, values)`;
- `addFollowup(dto, values)` / `updateFollowup(dto, id, values)`;
- `dispose()`.

DTO zawiera `id`, `patientId`, `rev`, `updatedAtISO`, odłączoną kopię `baseNote`
i `context`. Edycja używa istniejącego `updateExistingPatientNote` z przechwyconą
rewizją i widoczną wersją. Utworzenie używa `savePatientNoteOnce` z losowym ID.
Zmiana właściciela, blokada lub odtworzenie innej sesji kończy operację przed
kolejnym krokiem. Opcjonalny zaufany drugi argument `{ isCurrent }` tych dwóch
istniejących aktorów jest sprawdzany również w ich dotychczasowej kontroli
`beforeCommit`, po szyfrowaniu i przed przekazaniem wiersza adapterowi. Callback
nie jest częścią notatki i nie trafia do eksportu.

`removeDiagnosis` sprawdza przechwyconą rewizję przez natywnego aktora
`removeExistingPatientNote` z opcjonalnym zaufanym `{ isCurrent }`. Zapis usuwa
wyłącznie ten rekord oraz tworzy zwykły nagrobek notatki do synchronizacji.
Scoped usunięcie i nagrobek mają jeden atomowy commit: transakcję IndexedDB,
podmianę obu map pamięci albo istniejący etap chronionego workspace.
Konflikt rewizji daje `TREATMENT_CONFLICT`; utrata właściciela przed rozpoczęciem
zatwierdzania zatrzymuje operację. Usunięcie nie zamyka terapii, nie kasuje jej
`diagnosisIds` i nie zmienia pomiarów ani wersji karty. W `audyt` każde
rozpoznanie jest ogólne (pacjenta, nie wizyty) — opis niżej, w części
„Usuwanie rozpoznania”.

Odczyty i otwieranie zakładki niczego nie zapisują. Nieobsługiwany kontekst jest
tylko do odczytu również w dawnych ścieżkach edycji notatek. Natywne przeniesienie
całego pacjenta zachowuje taki nieprzezroczysty dokument pod tym samym ID;
import i synchronizacja przenoszą go bez interpretowania jego pól.

Edytor rozpoznań i epizodów jest dostępny w nowej Karcie pacjenta na stronie
głównej. Na ekranach bez tego modułu, np. w dotychczasowej karcie w DocPro,
wybranie edycji wpisu leczenia pokazuje informację o miejscu edycji i zachowuje
obecną kartę. Nie uruchamia zwykłego edytora tekstowej notatki ani pustej zakładki.

## Rozpoznania w dotychczasowej Karcie pacjenta (`audyt`, P-ROZPOZNANIA rata 1)

Decyzją właściciela z 24.11.2026 zapis rozpoznań wszedł do `audyt` przed nową
stroną główną, żeby rozpoznania dało się wpisywać i liczyć od razu. Do `audyt`
trafiły bez zmian: model i magazyn (`runtime/patient-treatment-v1/model.js`,
`store.js`), osiemnaście punktów włączenia w sejfie z fragmentem
`vault-fragment.js` w stanie sprzed dokumentacji wizyt, katalog ICD-10 z
wyszukiwarką i kontrolką wyboru kodu oraz testy tych części. Kształt zapisu,
identyfikatory i transport są te same, więc rozpoznanie wpisane w dotychczasowej
Karcie jest dla nowej Karty zwykłym, edytowalnym rozpoznaniem.

Dotychczasowa Karta (`vilda_auth_ui.js`, blok `Kr_`) ma w zakładce „Leczenie”
sekcję „Rozpoznania pacjenta” — pierwszy blok zakładki, nad kartami leczenia
GH i otyłości. Zakładka jest przez to u każdego pacjenta, także bez leczenia.
Sekcja pokazuje rozpoznania z notatek, które Karta i tak czyta, oraz przyciski
„Dodaj rozpoznanie” i „Edytuj”. Formularz ma te same pola co w nowej Karcie:
nazwę, kod ICD-10 (kontrolka `VildaICD10Picker`), stan i datę. Zapis i edycja
idą przez `VildaPatientTreatmentStore.createScope(...)`. Epizodów leczenia
w tej Karcie nie da się dodać ani zmienić; jeśli istnieją (z nowszej wersji
aplikacji), sekcja mówi, ile ich jest, a ich treść jest w „Notatkach”.

Trzy pliki katalogu nie są ładowane ze stroną. Karta doczytuje je przy
pierwszym otwarciu formularza; gdy pliku nie ma, formularz pokazuje zwykłe
pole kodu ręcznego (do 24 znaków). Do chwili, gdy pole kodu jest gotowe,
przycisk „Zapisz” jest wyłączony, żeby edycja nie zapisała rozpoznania bez
jego kodu. Pliki są w paczce precache interfejsu wizyt
(`tools/build-visit-ui-precache.mjs`), więc pierwsze otwarcie działa też bez sieci.

Wszędzie, gdzie aplikacja otwiera edytor istniejącej notatki (np. `Edytuj`
w „Notatkach”), wpis rozpoznania otwiera formularz rozpoznania, a nie zwykły
edytor tekstu (`ga` → `Kr_zNotatki`). Inny zapis leczenia jest tu tylko do
odczytu. `Usuń` w „Notatkach” przy rozpoznaniu usuwa je tym samym mechanizmem co
formularz (niżej), a przy innym zapisie leczenia pokazuje, że jest on tu tylko
do odczytu. Sekcja odświeża się po każdej
zmianie notatki pacjenta zgłoszonej przez sejf (`onPatientNoteChanged`).
Formularz znika przy zablokowaniu sejfu i przy zmianie pacjenta lub sesji;
niezapisane zmiany chroni pytanie przy zamknięciu i `beforeunload`.

Statystyki Bazy pacjentów (P-ROZPOZNANIA rata 2) czytają rozpoznania całej bazy
jednym odczytem `listPatientNotesByCategory('treatment')` i dekodują je tym
samym modelem (`VildaPatientTreatmentModel.decode`); zliczanie według kodu
i nazwy opisuje wpis „P-ROZPOZNANIA, rata 2” w `docs/clinical/ALGORITHMS.md`.
Statystyki niczego nie zapisują i nie zmieniają rozpoznań.

Bieżący formularz z niezapisanymi zmianami, trwającym zapisem lub niepewnym
wynikiem zapisu korzysta z natywnej ochrony `beforeunload`. Odmowa odświeżenia
zachowuje ten sam formularz. Zamknięcie, blokada i usunięcie widoku zwalniają
handler; ochrona nie zapisuje szkicu automatycznie.

### Usuwanie rozpoznania (`audyt`, P-ROZPOZNANIA rata 3)

Prośba właściciela z 24.11.2026: w dotychczasowej Karcie rozpoznanie ma się dać
usunąć, a mechanizm ma być zgodny z nową Kartą pacjenta, żeby późniejsze
scalenie nowej strony głównej było proste.

**Co widzi lekarz.** Formularz „Edytuj rozpoznanie” (otwarty z sekcji albo
z „Notatek”) ma na końcu, pod „Anuluj”, przycisk „Usuń rozpoznanie”. Pytanie
przed usunięciem: „Usunąć to rozpoznanie z kartoteki pacjenta?”, z dopiskiem
o powiązanych zapisach leczenia (zostają bez zmian) i o odrzuceniu
niezapisanych zmian formularza. Po usunięciu sekcja pokazuje „Usunięto
rozpoznanie.”. Gdy rozpoznanie zmieniło się w innym miejscu, usunięcie odmawia
(komunikat o zmianie zapisu), a formularz można już tylko zamknąć — jak po
nieudanym zapisie. Formularz nowego rozpoznania nie ma przycisku. „Usuń” przy
wpisie rozpoznania w „Notatkach” pyta tak samo i usuwa tą samą drogą
(`CareDeleteCheckedNote` → `Kr_usunZNotatek`); zwykłe usuwanie notatki nie
dotyka zapisów leczenia.

**Mechanizm — ten sam, co w nowej Karcie.** Interfejs woła
`removeDiagnosis(dto)` magazynu leczenia. Magazyn przekazuje przechwyconą
rewizję i widoczną wersję aktorowi `removeExistingPatientNote` ze świadkiem
`{ isCurrent, diagnosisMutation: { visitContext: null } }`. Aktor sprawdza
sesję, nagrobek, pacjenta i rewizję jak przy każdej zmianie istniejącej
notatki, potwierdza, że zapis jest obsługiwanym rozpoznaniem
(`TREATMENT_UNSUPPORTED` w innym razie), i usuwa zapis razem z nagrobkiem
`{ id, deletedAtISO, rev }` w jednym niepodzielnym kroku
(`commitDiagnosisDeleteForUser`: jedna transakcja IndexedDB na sklepach notatek
i nagrobków, podmiana obu map w pamięci albo etap chronionego workspace).
Nieudane zatwierdzenie nie zostawia ani usuniętego zapisu, ani nagrobka, ani
zdarzenia zmiany. Świadek jest utrwalany w chwili wywołania aktora
(`DiagnosisMutationInstall`), zanim wywołanie trafi do kolejki — późniejsza
zmiana obiektu opcji niczego nie zmienia. Zwykłe `removeExistingPatientNote`
bez świadka działa jak dotąd.

**Warstwa sejfu.** `VILDA DIAGNOSIS MUTATION V1` — te same ścieżki, nazwa
i znaczniki co na gałęzi nowej strony głównej:
`runtime/diagnosis-mutation-v1/vault-fragment.js`, `manifest.json`,
`tools/diagnosis-mutation-vault-delta.mjs`. W `audyt` jest to **wydanie bez
dokumentów wizyt** (dziesięć punktów włączenia), nałożone bezpośrednio na obraz
warstwy leczenia:

| Część | `audyt` | Pełna warstwa (gałąź nowej strony głównej) |
| --- | --- | --- |
| `removeDiagnosis` w magazynie, eksport w zakresie | jest (bez bindingu wizyty) | jest, z bindingiem wizyty |
| przekazanie opcji do aktora, kontrola rodzaju zapisu, niepodzielne usunięcie, most adaptera hybrydowego | ten sam tekst | ten sam tekst |
| `commitDiagnosisDeleteForUser` w adapterach IndexedDB i pamięci | ta sama metoda, inne miejsce wstawienia | obok kosza wizyt |
| funkcje fragmentu | te same poza `DiagnosisMutationOrigin` | — |
| pochodzenie z wizyty (`visitContext`) | brak czytnika: zapis albo świadek, który nazywa wizytę, jest odrzucany (`TREATMENT_VISIT_READONLY`) | sprawdzane, edycja i usunięcie tylko z otwartej tej samej wizyty |
| edycja rozpoznania przez świadka, blokada pacjenta wspólna z koszem wizyt | brak (edycja idzie jak w racie 1) | jest |

**Scalenie z nową stroną główną.** Wydanie z `audyt` jest podzbiorem pełnej
warstwy: wszystko, co tu przechodzi (ogólne rozpoznanie), przechodzi tam tak
samo. Przy scalaniu pliki `runtime/diagnosis-mutation-v1/*`,
`tools/diagnosis-mutation-vault-delta.mjs` i obraz sejfu bierze się z gałęzi
nowej strony głównej, a jej łańcuch warstw nakłada się na obraz warstwy
leczenia — wydanie z `audyt` zdejmuje wcześniej polecenie kontroli
(`restoreDiagnosisMutationBaseline`). Interfejs dotychczasowej Karty woła tylko
`removeDiagnosis(dto)` i rozumie odpowiedź `TREATMENT_VISIT_READONLY`, więc po
scaleniu działa bez zmian.

**Ograniczenie do czasu scalenia.** `audyt` nie zapisuje ani nie odczytuje
pochodzenia zapisu z wizyty. Rozpoznanie wpisane w ramach wizyty w podglądzie
nowej strony głównej, jeśli trafi przez synchronizację do bieżącej aplikacji,
jest tu zwykłym rozpoznaniem pacjenta i da się je usunąć (a edycja w `audyt`,
jak od raty 1, zapisuje je bez tego pochodzenia).

## Wyszukiwanie kodu ICD-10

W polu „Kod ICD-10 · opcjonalnie” lekarz wyszukuje kod lub polską nazwę.
Lokalny katalog CeZ zawiera 12 010 pozycji, stan na 31.03.2021; data jest
widoczna przy polu. Źródło, licencja i ograniczenia:
[ICD10_CATALOGUE.md](clinical/ICD10_CATALOGUE.md). Wyszukiwanie ignoruje
wielkość liter i polskie znaki, uwzględnia wszystkie wpisane wyrazy oraz
osobny kontekst kategorii. Zapis `E119` odnajduje `E11.9`. Lista pokazuje
najwyżej 12 kodów i liczbę pozostałych dopasowań; dalsze pisanie ją zawęża.

Tekst wyszukiwania nie jest polem zapisywanego dokumentu. Kod ustala dopiero
wybór podpowiedzi lub jawne zatwierdzenie własnego kodu ręcznego (do 24 znaków).
Nierozstrzygnięte wyszukiwanie blokuje zapis formularza. Puste pole usuwa kod;
rozpoznanie nadal można zapisać bez niego. Brak w historycznym katalogu nie
oznacza nieprawidłowego kodu. Dotychczasowe ręczne kody pozostają dostępne.

Wybranie pozycji zachowuje źródłowy kod wraz z `†`/`*`. Pełna nazwa katalogowa
uzupełnia puste pole nazwy albo poprzednią automatyczną nazwę z tego samego
edytora. Własny opis lekarza i nazwa istniejącego rozpoznania nie są nadpisywane;
można jawnie użyć nazwy z katalogu. Kategoria nadrzędna jest prezentowana osobno,
bez doklejania ani skracania zapisywanej nazwy. Limity modelu pozostają bez zmian.

Strzałki wybierają podpowiedź, Enter zatwierdza wyłącznie aktywną pozycję;
sam Enter w polu wyszukiwania nie zapisuje formularza. Escape najpierw zamyka
listę. Zapytanie nie trafia do sieci, historii, sejfu ani localStorage. Zamknięcie,
blokada i utrata właściciela usuwają formularz oraz jego wyszukiwanie. Katalog
i moduły wyszukiwania są częścią zweryfikowanego precache PWA i działają offline.

## Transport i zgodność

`Ft` odczytuje opcjonalne pole, `Ad` zachowuje je przy pominięciu przez starszego
wywołującego, a porównanie treści, CAS oraz deduplikator uwzględniają kontekst.
`Le` zachowuje pole całej zwycięskiej treści; starszy przychodzący zapis bez
rozszerzenia nie usuwa istniejącego kontekstu. Nie łączymy osobno pól dwóch
równoległych epizodów.

### Urządzenie, które dostało zapis leczenia na starszej wersji aplikacji (P-ROZPOZNANIA rata 4)

Wersja aplikacji sprzed zapisu leczenia przyjmuje z synchronizacji rozpoznanie
jako zwykłą notatkę kategorii `treatment` (tytuł „Rozpoznanie · …”, treść
z kodem), ale nie zapisuje `treatmentContext`, bo go nie zna. Po aktualizacji
aplikacji ta sama wersja notatki (ten sam `rev` i `updatedAtISO`) nie jest już
dla scalania „nowsza”, więc bez dodatkowej reguły kontekst nigdy by nie wrócił:
urządzenie pokazywałoby wpis w „Notatkach”, a sekcja rozpoznań i statystyki
byłyby puste. Zgłoszenie właściciela z 24.11.2026 (rozpoznania wpisane na
komputerze, niewidoczne na telefonie).

Reguła uzupełnienia (`TreatmentSyncHydrationCandidate`,
`TreatmentHydrateSyncRecord` — ten sam kształt co istniejące uzupełnianie planów
opieki `CareMvpHydrateSyncRecord`): gdy ładunek synchronizacji (pełny albo
zaszyfrowana delta notatki) niesie **dokładnie tę samą wersję tej samej notatki**
— to samo `id`, ten sam pacjent, `rev`, `updatedAtISO` i wszystkie czytelne pola
— a tutejsza kopia nie ma `treatmentContext`, tutejsza kopia przejmuje kontekst
z ładunku. Nic więcej się nie zmienia: bez nowej rewizji i bez nowej chwili
zapisu; sejf zgłasza zmianę notatki (`action: 'merge'`), więc otwarta Karta
odświeża sekcję. Reguła nie działa, gdy tutejsza kopia ma już kontekst (także
inny), gdy różni się wersja albo czytelna treść (wtedy rozstrzygają zwykłe
reguły scalania) i dla notatek bez kontekstu w ładunku. Kontekst w nowszym
formacie jest przenoszony bez interpretowania, jak przy zwykłym scaleniu.

Kierunek odwrotny był bezpieczny od raty 1: urządzenie z kontekstem nie traci
go, gdy dostaje tę samą albo nowszą wersję bez pola. Pełna synchronizacja to
pobranie i wysłanie, więc urządzenie z kompletnym zapisem przy najbliższej
synchronizacji wysyła go na serwer, a urządzenie po aktualizacji uzupełnia go
przy swoim następnym pobraniu.

Warstwa sejfu: `VILDA TREATMENT SYNC HYDRATION V1` —
`runtime/treatment-sync-hydration-v1/vault-fragment.js`, `manifest.json`,
`tools/treatment-sync-hydration-vault-delta.mjs`; trzy punkty włączenia obok
uzupełniania planów opieki w scalaniu notatek. Te same kotwice ma sejf gałęzi
nowej strony głównej, więc warstwę da się tam nałożyć po zmianie samej stałej
`BASE` (tamten sejf ma ten sam błąd).

Eksport pacjenta, kopia konta i delty korzystają z istniejących ścieżek notatek.
Import pacjenta zachowuje ID notatek i zmienia wyłącznie zewnętrzny `patientId`
na docelowego pacjenta. Tak samo działa natywne scalenie kart, więc powiązania
między ich przeniesionymi rozpoznaniami i epizodami pozostają stabilne. Nowe
pole nie wymaga migracji istniejącego sejfu ani zmiany indeksów IndexedDB.

Dotychczasowe dane i obliczenia GH/IGF-1, otyłości, leków oraz plany opieki nie są
przepisywane do tego rejestru. Pozostają pod własnymi nazwami i w istniejących
modułach. Ta zmiana nie dodaje algorytmów medycznych, norm, progów, kodowania
automatycznego ani oceny skuteczności dowolnej terapii.

## Odtworzenie artefaktu

Czytelne źródła to `runtime/patient-treatment-v1/model.js`, `store.js` oraz
`vault-fragment.js`. Manifest przypina ich skróty i osiemnaście dokładnych
punktów włączenia. `tools/patient-treatment-vault-delta.mjs` sprawdza pełne
odwrócenie warstwy i odtworzenie jej bajtów; nie formatuje pozostałego sejfu.
Chroniony blok natywnego clinical workspace pozostaje bez zmian. Aktualną bazę
tego prywatnego składacza opisuje jego własny manifest granicy.

W `audyt` warstwa leczenia jest zewnętrzną warstwą sejfu: jej bazą jest cały
`vilda_vault.js` sprzed warstwy, a pozostałe straże (trwałe wizyty, KtV, blok
natywny) najpierw ją zdejmują. Ich przypięte skróty nie zmieniają się więc przy
tej zmianie. Odtworzenie i kontrola:

```bash
node tools/patient-treatment-vault-delta.mjs                 # kontrola bieżącego sejfu
node tools/patient-treatment-vault-delta.mjs --rebuild BAZA.js WYNIK.js
```

Po każdej zmianie sejfu pod tą warstwą (także po nowym bloku natywnym
z repozytorium źródeł modułu) warstwę nakłada się ponownie poleceniem
`--rebuild` i przypina nowe `baseVaultSHA256` oraz `integratedVaultSHA256`
w `runtime/patient-treatment-v1/manifest.json` i stałą `BASE` w narzędziu.

Od raty 3 nad warstwą leczenia leży jeszcze warstwa usuwania rozpoznania
(`VILDA DIAGNOSIS MUTATION V1`). Jest najbardziej zewnętrzna: straże zdejmują
ją pierwszą (`restorePatientTreatmentBaseline` woła najpierw
`restoreDiagnosisMutationBaseline`), więc skróty warstwy leczenia i warstw pod
nią nie zmieniły się. Jej bazą jest obraz warstwy leczenia
(`integratedVaultSHA256` z `runtime/patient-treatment-v1/manifest.json`).
Kolejność odtwarzania po zmianie sejfu pod spodem:

```bash
node tools/patient-treatment-vault-delta.mjs --rebuild BAZA.js LECZENIE.js
# nowy skrót LECZENIE.js → stała BASE w tools/diagnosis-mutation-vault-delta.mjs
node tools/diagnosis-mutation-vault-delta.mjs --build LECZENIE.js vilda_vault.js   # zapisuje też manifest
node tools/diagnosis-mutation-vault-delta.mjs                                      # kontrola bieżącego sejfu
```

Od raty 4 najbardziej zewnętrzna jest warstwa uzupełniania kontekstu przy
synchronizacji (`VILDA TREATMENT SYNC HYDRATION V1`); jej bazą jest obraz
warstwy usuwania rozpoznania, a `restoreDiagnosisMutationBaseline` zdejmuje ją
jako pierwszą. Po poleceniach wyżej (wynik drugiego do pliku pośredniego
`USUWANIE.js` zamiast `vilda_vault.js`):

```bash
# nowy skrót USUWANIE.js → stała BASE w tools/treatment-sync-hydration-vault-delta.mjs
node tools/treatment-sync-hydration-vault-delta.mjs --build USUWANIE.js vilda_vault.js   # zapisuje też manifest
node tools/treatment-sync-hydration-vault-delta.mjs                                      # kontrola bieżącego sejfu
```
